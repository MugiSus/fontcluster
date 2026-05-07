use crate::config::AgglomerativeConfig;
use crate::error::{AppError, Result};
use ndarray::Array2;
use petal_decomposition::PcaBuilder;
use std::cmp::Ordering;
use std::collections::BinaryHeap;

pub enum EmbeddingEngine {
    Pca { dimensions: usize },
}

impl EmbeddingEngine {
    pub fn pca(dimensions: usize) -> Self {
        Self::Pca { dimensions }
    }

    pub fn embed(&self, data: Array2<f32>) -> Result<Array2<f32>> {
        match self {
            Self::Pca { dimensions } => pca_embedding(data, *dimensions),
        }
    }
}

fn pca_embedding(data: Array2<f32>, dimensions: usize) -> Result<Array2<f32>> {
    let (n_samples, n_features) = data.dim();
    if n_samples < 2 {
        return Err(AppError::Processing(
            "PCA requires at least two feature vectors".into(),
        ));
    }
    if n_features < 2 {
        return Err(AppError::Processing(
            "PCA requires at least two features".into(),
        ));
    }

    let dimensions = dimensions.clamp(1, n_samples.min(n_features));

    PcaBuilder::new(dimensions)
        .build()
        .fit_transform(&data)
        .map_err(|e| AppError::Processing(e.to_string()))
}

pub struct ClusteringResult {
    pub labels: Vec<i32>,
    pub outlier_scores: Vec<Option<f32>>,
    pub is_outlier: Vec<bool>,
    pub cluster_count: usize,
}

pub enum ClusteringEngine {
    Agglomerative(AgglomerativeConfig),
}

impl ClusteringEngine {
    pub fn from_agglomerative(config: AgglomerativeConfig) -> Self {
        Self::Agglomerative(config)
    }

    pub fn cluster(&self, points: Array2<f32>) -> Result<ClusteringResult> {
        match self {
            Self::Agglomerative(config) => agglomerative_clustering(points, config),
        }
    }
}

#[derive(Debug, Clone)]
struct AgglomerativeCluster {
    members: Vec<usize>,
    active: bool,
}

impl AgglomerativeCluster {
    fn size(&self) -> usize {
        self.members.len()
    }
}

#[derive(Debug, Clone, Copy)]
struct QueueItem {
    distance: f32,
    left: usize,
    right: usize,
}

impl PartialEq for QueueItem {
    fn eq(&self, other: &Self) -> bool {
        self.distance.to_bits() == other.distance.to_bits()
            && self.left == other.left
            && self.right == other.right
    }
}

impl Eq for QueueItem {}

impl PartialOrd for QueueItem {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for QueueItem {
    fn cmp(&self, other: &Self) -> Ordering {
        other
            .distance
            .partial_cmp(&self.distance)
            .unwrap_or(Ordering::Equal)
            .then_with(|| other.left.cmp(&self.left))
            .then_with(|| other.right.cmp(&self.right))
    }
}

fn agglomerative_clustering(
    points: Array2<f32>,
    config: &AgglomerativeConfig,
) -> Result<ClusteringResult> {
    let n = points.nrows();
    if n == 0 {
        return Ok(ClusteringResult {
            labels: Vec::new(),
            outlier_scores: Vec::new(),
            is_outlier: Vec::new(),
            cluster_count: 0,
        });
    }
    if n == 1 {
        return Ok(ClusteringResult {
            labels: vec![0],
            outlier_scores: vec![None],
            is_outlier: vec![false],
            cluster_count: 1,
        });
    }

    let normalized = normalize_points(&points);
    let mut clusters = (0..n)
        .map(|i| AgglomerativeCluster {
            members: vec![i],
            active: true,
        })
        .collect::<Vec<_>>();
    let mut distances = vec![vec![f32::INFINITY; n]; n];
    let mut queue = BinaryHeap::new();

    for i in 0..n {
        for j in (i + 1)..n {
            let distance = point_distance(&normalized, i, j);
            distances[i][j] = distance;
            distances[j][i] = distance;
            queue.push(QueueItem {
                distance,
                left: i,
                right: j,
            });
        }
    }

    let mut active_count = n;
    let target_cluster_count = if config.target_cluster_count > 0 {
        Some(config.target_cluster_count.clamp(1, n))
    } else {
        None
    };
    let distance_threshold = if config.distance_threshold > 0.0 {
        Some(config.distance_threshold)
    } else {
        None
    };

    while should_continue_merging(active_count, target_cluster_count, distance_threshold) {
        let Some(next) = pop_active_pair(&mut queue, &clusters) else {
            break;
        };

        if let Some(threshold) = distance_threshold {
            if next.distance > threshold {
                break;
            }
        }

        let left_size = clusters[next.left].size();
        let right_size = clusters[next.right].size();
        let mut members = Vec::with_capacity(left_size + right_size);
        members.extend_from_slice(&clusters[next.left].members);
        members.extend_from_slice(&clusters[next.right].members);

        clusters[next.left].active = false;
        clusters[next.right].active = false;
        clusters.push(AgglomerativeCluster {
            members,
            active: true,
        });
        active_count -= 1;

        let new_index = clusters.len() - 1;
        for row in distances.iter_mut() {
            row.push(f32::INFINITY);
        }
        distances.push(vec![f32::INFINITY; new_index + 1]);

        for other in 0..new_index {
            if !clusters[other].active {
                continue;
            }
            let distance = average_linkage_distance(
                &distances, next.left, next.right, left_size, right_size, other,
            );
            distances[new_index][other] = distance;
            distances[other][new_index] = distance;
            queue.push(QueueItem {
                distance,
                left: other,
                right: new_index,
            });
        }
    }

    let mut active_clusters = clusters
        .iter()
        .filter(|cluster| cluster.active)
        .map(|cluster| cluster.members.clone())
        .collect::<Vec<_>>();
    active_clusters.sort_by_key(|members| members.iter().copied().min().unwrap_or(usize::MAX));

    let mut labels = vec![-1; n];
    for (cluster_id, members) in active_clusters.iter().enumerate() {
        for point_index in members {
            labels[*point_index] = cluster_id as i32;
        }
    }

    Ok(ClusteringResult {
        labels,
        outlier_scores: vec![None; n],
        is_outlier: vec![false; n],
        cluster_count: active_clusters.len(),
    })
}

fn normalize_points(points: &Array2<f32>) -> Array2<f32> {
    let mut normalized = points.clone();
    for axis in 0..points.ncols() {
        let column = points.column(axis);
        let min = column.iter().copied().fold(f32::INFINITY, f32::min);
        let max = column.iter().copied().fold(f32::NEG_INFINITY, f32::max);
        let range = max - min;
        for value in normalized.column_mut(axis).iter_mut() {
            *value = if range > 0.0 {
                (*value - min) / range
            } else {
                0.0
            };
        }
    }
    normalized
}

fn point_distance(points: &Array2<f32>, left: usize, right: usize) -> f32 {
    points
        .row(left)
        .iter()
        .zip(points.row(right).iter())
        .map(|(left, right)| {
            let delta = left - right;
            delta * delta
        })
        .sum::<f32>()
        .sqrt()
}

fn should_continue_merging(
    active_count: usize,
    target_cluster_count: Option<usize>,
    distance_threshold: Option<f32>,
) -> bool {
    if active_count <= 1 {
        return false;
    }
    if let Some(target_cluster_count) = target_cluster_count {
        active_count > target_cluster_count
    } else {
        distance_threshold.is_some()
    }
}

fn pop_active_pair(
    queue: &mut BinaryHeap<QueueItem>,
    clusters: &[AgglomerativeCluster],
) -> Option<QueueItem> {
    while let Some(item) = queue.pop() {
        if clusters
            .get(item.left)
            .is_some_and(|cluster| cluster.active)
            && clusters
                .get(item.right)
                .is_some_and(|cluster| cluster.active)
        {
            return Some(item);
        }
    }
    None
}

fn average_linkage_distance(
    distances: &[Vec<f32>],
    left: usize,
    right: usize,
    left_size: usize,
    right_size: usize,
    other: usize,
) -> f32 {
    let total_size = left_size + right_size;
    let left_distance = distances[left][other];
    let right_distance = distances[right][other];
    (left_distance * left_size as f32 + right_distance * right_size as f32) / total_size as f32
}
