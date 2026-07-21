//! Factor rotations for PCA loadings and their matching sample scores.

use crate::config::FactorRotation;
use lair::decomposition::lu::Factorized;
use ndarray::{Array1, Array2};

const PROMAX_POWER: i32 = 4;
const VARIMAX_MAX_ITERATIONS: usize = 100;
const VARIMAX_TOLERANCE: f32 = 1e-6;

/// Rotates PCA loadings and returns scores expressed in the rotated factor basis.
///
/// `components` contains PCA axes by row and `singular_values` supplies their
/// scale. Combining both is essential: rotating orthonormal component vectors
/// alone discards the variance structure that factor rotation is meant to use.
pub(super) fn rotate_pca_scores(
    scores: Array2<f32>,
    components: &Array2<f32>,
    singular_values: &Array1<f32>,
    sample_count: usize,
    mode: FactorRotation,
) -> Array2<f32> {
    let factors = scores.ncols();
    if mode == FactorRotation::None
        || factors < 2
        || components.nrows() != factors
        || singular_values.len() != factors
        || sample_count < 2
    {
        return scores;
    }

    let scale = ((sample_count - 1) as f32).sqrt();
    let mut loadings = components.t().to_owned();
    for (mut column, singular) in loadings
        .columns_mut()
        .into_iter()
        .zip(singular_values.iter())
    {
        column *= *singular / scale;
    }

    let varimax = varimax_rotation(&mut loadings);
    let varimax_scores = scores.dot(&varimax);
    if mode == FactorRotation::Varimax {
        return varimax_scores;
    }

    let target = loadings.mapv(|value| value.signum() * value.abs().powi(PROMAX_POWER));
    let gram = loadings.t().dot(&loadings);
    let cross = loadings.t().dot(&target);
    let Some(mut promax) = solve_matrix(&gram, &cross) else {
        return varimax_scores;
    };

    // Hendrickson–White column normalisation makes the resulting factor
    // correlation matrix have a unit diagonal.
    let coefficient_gram = promax.t().dot(&promax);
    let Some(coefficient_gram_inverse) = inverse(&coefficient_gram) else {
        return varimax_scores;
    };
    for factor in 0..factors {
        let norm = coefficient_gram_inverse[(factor, factor)].sqrt();
        if !norm.is_finite() || norm <= f32::EPSILON {
            return varimax_scores;
        }
        promax.column_mut(factor).mapv_inplace(|value| value * norm);
    }

    // Loadings transform as L·T, therefore scores transform as S·(T⁻¹)ᵀ to
    // retain the PCA reconstruction under an oblique rotation.
    let Some(promax_inverse) = inverse(&promax) else {
        return varimax_scores;
    };
    varimax_scores.dot(&promax_inverse.t())
}

/// Cyclic pairwise Kaiser varimax. Each step is a closed-form planar rotation;
/// cycling the factor pairs supports both the 2-D scatter and the wider
/// preprocessing PCA without introducing a second decomposition implementation.
fn varimax_rotation(loadings: &mut Array2<f32>) -> Array2<f32> {
    let factor_count = loadings.ncols();
    let variable_count = loadings.nrows() as f32;
    let mut rotation = Array2::eye(factor_count);
    let mut previous_objective = f32::NEG_INFINITY;

    for _ in 0..VARIMAX_MAX_ITERATIONS {
        for left in 0..factor_count - 1 {
            for right in left + 1..factor_count {
                let (mut sum_u, mut sum_v, mut sum_uu_minus_vv, mut sum_two_uv) =
                    (0.0, 0.0, 0.0, 0.0);
                for row in loadings.rows() {
                    let u = row[left] * row[left] - row[right] * row[right];
                    let v = 2.0 * row[left] * row[right];
                    sum_u += u;
                    sum_v += v;
                    sum_uu_minus_vv += u * u - v * v;
                    sum_two_uv += 2.0 * u * v;
                }
                let angle = 0.25
                    * (sum_two_uv - 2.0 * sum_u * sum_v / variable_count)
                        .atan2(sum_uu_minus_vv - (sum_u * sum_u - sum_v * sum_v) / variable_count);
                let (sin, cos) = angle.sin_cos();
                rotate_columns(loadings, left, right, cos, sin);
                rotate_columns(&mut rotation, left, right, cos, sin);
            }
        }

        let objective = loadings
            .columns()
            .into_iter()
            .map(|column| {
                let squares = column.mapv(|value| value * value);
                squares.mapv(|value| value * value).sum() - squares.sum().powi(2) / variable_count
            })
            .sum::<f32>();
        if (objective - previous_objective).abs() <= VARIMAX_TOLERANCE * objective.abs().max(1.0) {
            break;
        }
        previous_objective = objective;
    }
    rotation
}

fn rotate_columns(matrix: &mut Array2<f32>, left: usize, right: usize, cos: f32, sin: f32) {
    for row in 0..matrix.nrows() {
        let x = matrix[(row, left)];
        let y = matrix[(row, right)];
        matrix[(row, left)] = cos * x + sin * y;
        matrix[(row, right)] = -sin * x + cos * y;
    }
}

fn solve_matrix(coefficients: &Array2<f32>, right_hand_side: &Array2<f32>) -> Option<Array2<f32>> {
    let factorized = Factorized::from(coefficients.to_owned());
    if factorized.is_singular() {
        return None;
    }
    let mut solution = Array2::zeros(right_hand_side.raw_dim());
    for column in 0..right_hand_side.ncols() {
        let solved = factorized.solve(&right_hand_side.column(column)).ok()?;
        solution.column_mut(column).assign(&solved);
    }
    solution
        .iter()
        .all(|value| value.is_finite())
        .then_some(solution)
}

fn inverse(matrix: &Array2<f32>) -> Option<Array2<f32>> {
    solve_matrix(matrix, &Array2::eye(matrix.nrows()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use ndarray::{arr1, arr2};

    #[test]
    fn none_preserves_scores_exactly() {
        let scores = arr2(&[[1.0, 2.0], [3.0, 4.0]]);
        assert_eq!(
            rotate_pca_scores(
                scores.clone(),
                &Array2::eye(2),
                &arr1(&[2.0, 1.0]),
                2,
                FactorRotation::None,
            ),
            scores
        );
    }

    #[test]
    fn varimax_preserves_pairwise_distances() {
        let scores = arr2(&[[1.0, 0.0], [0.0, 1.0], [-1.0, 0.5], [0.3, -0.7]]);
        let components = arr2(&[[0.5, 0.5, 0.70710677], [0.5, 0.5, -0.70710677]]);
        let rotated = rotate_pca_scores(
            scores.clone(),
            &components,
            &arr1(&[3.0, 1.0]),
            4,
            FactorRotation::Varimax,
        );
        for left in 0..scores.nrows() {
            for right in left + 1..scores.nrows() {
                let before = &scores.row(left) - &scores.row(right);
                let after = &rotated.row(left) - &rotated.row(right);
                assert!((before.dot(&before) - after.dot(&after)).abs() < 1e-5);
            }
        }
    }

    #[test]
    fn promax_produces_finite_oblique_scores() {
        let scores = arr2(&[[1.0, 0.0], [0.0, 1.0], [-1.0, 0.5], [0.3, -0.7]]);
        let components = arr2(&[[0.8, 0.6, 0.0], [0.0, 0.6, 0.8]]);
        let rotated = rotate_pca_scores(
            scores.clone(),
            &components,
            &arr1(&[3.0, 1.0]),
            4,
            FactorRotation::Promax,
        );
        assert!(rotated.iter().all(|value| value.is_finite()));
        assert!((&rotated - &scores)
            .iter()
            .any(|difference| difference.abs() > 1e-4));
    }
}
