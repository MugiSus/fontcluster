use crate::commands::progress::progress_events;
use crate::config::{ComputedData, ProgressStage, RenderConfig};
use crate::core::session::{load_computed_data, save_computed_data};
use crate::core::{AppState, EventSink, FontRenderSource};
use crate::error::{AppError, Result};
use crate::rendering::FontRenderer;
use std::collections::HashMap;
use std::sync::atomic::Ordering;
use std::sync::Arc;

pub struct SampleRenderer {}

impl SampleRenderer {
    pub fn new() -> Self {
        Self {}
    }

    pub async fn render_all(
        &self,
        events: &impl EventSink,
        state: &AppState,
        render_sources: HashMap<String, FontRenderSource>,
    ) -> Result<()> {
        let (discovered_fonts, session_id, text, font_size) = {
            let guard = state.current_session.lock().unwrap();
            let s = guard.as_ref().unwrap();
            let rendering = &s.algorithm.rendering;
            (
                s.discovered_fonts.clone(),
                s.session_id.clone(),
                rendering.text.clone(),
                rendering.font_size,
            )
        };
        let session_dir = AppState::get_session_processing_dir(&session_id)?;

        let mut tasks = Vec::new();
        for (weight, families) in discovered_fonts {
            for family in families {
                tasks.push((family, weight));
            }
        }

        println!("📋 Total sample rendering tasks: {}", tasks.len());
        if tasks.is_empty() {
            println!("⚠️ No fonts discovered for weights. Skipping rendering.");
        }

        progress_events::reset_progress(events, state, ProgressStage::Rendering);
        progress_events::set_progress_denominator(
            events,
            state,
            ProgressStage::Rendering,
            tasks.len() as i32,
        );

        let render_config = Arc::new(RenderConfig {
            text,
            font_size,
            output_dir: session_dir,
        });

        let events = events.clone();
        let state_clone = state.clone();
        let render_config = Arc::clone(&render_config);

        tokio::task::spawn_blocking(move || -> Result<()> {
            use rayon::prelude::*;
            tasks
                .into_par_iter()
                .for_each(|(family_name, target_weight)| {
                    if state_clone.is_cancelled.load(Ordering::Relaxed) {
                        return;
                    }

                    let safe_name = crate::config::FontMetadata::generate_safe_name(
                        &family_name,
                        target_weight,
                    );

                    let res: Result<()> = (|| {
                        let render_source = render_sources.get(&safe_name).ok_or_else(|| {
                            AppError::Processing(format!(
                                "No render source for font metadata {}",
                                safe_name
                            ))
                        })?;

                        let renderer = FontRenderer::new(Arc::clone(&render_config));
                        renderer.render_sample(
                            &render_source.path,
                            render_source.font_index,
                            &safe_name,
                        )?;
                        let mut computed =
                            load_computed_data(&render_config.output_dir, &safe_name).unwrap_or(
                                ComputedData {
                                    rendered_text: None,
                                    positioning: None,
                                    clustering: None,
                                },
                            );
                        computed.rendered_text = Some(render_config.text.clone());
                        save_computed_data(&render_config.output_dir, &safe_name, &computed)?;
                        Ok(())
                    })();

                    match res {
                        Ok(_) => progress_events::increase_numerator(
                            &events,
                            &state_clone,
                            ProgressStage::Rendering,
                            1,
                        ),
                        Err(e) => {
                            eprintln!("❌ Failed to process {}: {}", family_name, e);
                            let font_dir =
                                render_config.output_dir.join("samples").join(&safe_name);
                            if font_dir.exists() {
                                let _ = std::fs::remove_dir_all(font_dir);
                            }
                            progress_events::decrease_denominator(
                                &events,
                                &state_clone,
                                ProgressStage::Rendering,
                                1,
                            );
                        }
                    }
                });
            Ok(())
        })
        .await
        .map_err(|e| AppError::Processing(e.to_string()))??;

        if state.is_cancelled.load(Ordering::Relaxed) {
            return Ok(());
        }

        state.update_status(|s| s.process_status = crate::config::ProcessStatus::Rendered)?;
        Ok(())
    }
}
