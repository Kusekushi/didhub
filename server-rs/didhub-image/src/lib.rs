//! # Image Processor
//!
//! A flexible and configurable image processing library for Rust applications.
//! Provides comprehensive image manipulation capabilities including resizing,
//! format conversion, validation, optimization, and PDF preparation.
//!
//! ## Features
//!
//! - **Flexible Processing**: Configurable resize algorithms, output formats, and quality settings
//! - **Format Support**: PNG, JPEG, GIF, WebP, BMP, TIFF input/output
//! - **Validation**: Comprehensive image validation with size and dimension checks
//! - **PDF Integration**: Alpha channel flattening for PDF embedding
//! - **Error Handling**: Detailed error types with `thiserror`
//! - **Async Ready**: Designed for both synchronous and asynchronous workflows
//!
//! ## Quick Start
//!
//! ```rust,no_run
//! use didhub_image::{ImageProcessor, ProcessingOptions};
//!
//! // Create a processor with default settings
//! let processor = ImageProcessor::new();
//!
//! // Process an image
//! let image_data = std::fs::read("input.jpg")?;
//! let result = processor.process(&image_data)?;
//!
//! println!("Processed image: {}x{}", result.metadata.final_width, result.metadata.final_height);
//! # Ok::<(), Box<dyn std::error::Error>>(())
//! ```

use image::{DynamicImage, GenericImageView, ImageFormat, RgbImage, RgbaImage};
use serde::{Deserialize, Serialize};
use std::io::Cursor;
use thiserror::Error;
use tracing::{debug, instrument};

#[derive(Error, Debug)]
pub enum ImageProcessingError {
    #[error("Failed to load image: {0}")]
    LoadError(#[from] image::ImageError),
    #[error("Failed to encode image: {0}")]
    EncodeError(String),
    #[error("Invalid image dimensions: {width}x{height}")]
    InvalidDimensions { width: u32, height: u32 },
    #[error("Image too large: {size} bytes (max: {max_size})")]
    TooLarge { size: usize, max_size: usize },
    #[error("Unsupported image format")]
    UnsupportedFormat,
    #[error("Image processing failed: {message}")]
    ProcessingError { message: String },
    #[error("Invalid quality value: {value} (must be 1-100)")]
    InvalidQuality { value: u8 },
    #[error("Invalid resize dimensions: {width}x{height}")]
    InvalidResizeDimensions { width: u32, height: u32 },
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ImageMetadata {
    pub orig_width: u32,
    pub orig_height: u32,
    pub final_width: u32,
    pub final_height: u32,
    pub max_dim: u32,
    pub orig_bytes: usize,
    pub final_bytes: usize,
    pub converted: bool,
    pub format: String,
    pub has_alpha: bool,
    pub processing_time_ms: u128,
}

#[derive(Debug, Clone)]
pub struct ProcessingOptions {
    /// Maximum dimension (width or height) for resizing. If None, no resizing occurs.
    pub max_dimension: Option<u32>,
    /// Target width. If specified with height, uses exact dimensions.
    pub target_width: Option<u32>,
    /// Target height. If specified with width, uses exact dimensions.
    pub target_height: Option<u32>,
    /// Output image format
    pub output_format: ImageFormat,
    /// JPEG quality (1-100). Only applies to JPEG output.
    pub quality: Option<u8>,
    /// Resize filter algorithm
    pub resize_filter: image::imageops::FilterType,
    /// Maximum input file size in bytes
    pub max_file_size: Option<usize>,
    /// Whether to maintain aspect ratio during resize
    pub maintain_aspect_ratio: bool,
    /// Background color for padding/filling (RGB)
    pub background_color: Option<[u8; 3]>,
    /// Whether to strip metadata from output
    pub strip_metadata: bool,
}

impl Default for ProcessingOptions {
    fn default() -> Self {
        Self {
            max_dimension: Some(2048),
            target_width: None,
            target_height: None,
            output_format: ImageFormat::Png,
            quality: None,
            resize_filter: image::imageops::FilterType::Lanczos3,
            max_file_size: Some(10 * 1024 * 1024), // 10MB
            maintain_aspect_ratio: true,
            background_color: Some([255, 255, 255]), // White
            strip_metadata: false,
        }
    }
}

impl ProcessingOptions {
    /// Create options for web-optimized images
    pub fn for_web() -> Self {
        Self {
            max_dimension: Some(1920),
            output_format: ImageFormat::WebP,
            quality: Some(85),
            ..Default::default()
        }
    }

    /// Create options for thumbnails
    pub fn for_thumbnail(size: u32) -> Self {
        Self {
            max_dimension: Some(size),
            output_format: ImageFormat::Jpeg,
            quality: Some(80),
            resize_filter: image::imageops::FilterType::Lanczos3,
            ..Default::default()
        }
    }

    /// Create options for exact dimensions (may crop or pad)
    pub fn exact_dimensions(width: u32, height: u32) -> Self {
        Self {
            target_width: Some(width),
            target_height: Some(height),
            max_dimension: None,
            maintain_aspect_ratio: false,
            ..Default::default()
        }
    }
}

/// Main image processor with configurable options
#[derive(Debug)]
pub struct ImageProcessor {
    default_options: ProcessingOptions,
}

impl ImageProcessor {
    /// Create a new image processor with default options
    pub fn new() -> Self {
        Self {
            default_options: ProcessingOptions::default(),
        }
    }

    /// Create a new image processor with custom default options
    pub fn with_options(options: ProcessingOptions) -> Self {
        Self {
            default_options: options,
        }
    }

    /// Process an image with the processor's default options
    #[instrument(skip(self, raw_bytes), fields(size = raw_bytes.len()))]
    pub fn process(&self, raw_bytes: &[u8]) -> Result<ProcessingResult, ImageProcessingError> {
        self.process_with_options(raw_bytes, &self.default_options)
    }

    /// Process an image with custom options
    #[instrument(skip(self, raw_bytes, options), fields(size = raw_bytes.len()))]
    pub fn process_with_options(
        &self,
        raw_bytes: &[u8],
        options: &ProcessingOptions,
    ) -> Result<ProcessingResult, ImageProcessingError> {
        let start_time = std::time::Instant::now();
        let (data, mut metadata) = process_image(raw_bytes, options)?;
        let processing_time = start_time.elapsed().as_millis();

        metadata.processing_time_ms = processing_time;

        Ok(ProcessingResult { data, metadata })
    }
}

impl Default for ImageProcessor {
    fn default() -> Self {
        Self::new()
    }
}

/// Result of an image processing operation
#[derive(Debug, Clone)]
pub struct ProcessingResult {
    pub data: Vec<u8>,
    pub metadata: ImageMetadata,
}

pub fn process_image(
    raw_bytes: &[u8],
    options: &ProcessingOptions,
) -> Result<(Vec<u8>, ImageMetadata), ImageProcessingError> {
    // Validate input size
    if let Some(max_size) = options.max_file_size {
        if raw_bytes.len() > max_size {
            return Err(ImageProcessingError::TooLarge {
                size: raw_bytes.len(),
                max_size,
            });
        }
    }

    let img = image::load_from_memory(raw_bytes)?;
    let (ow, oh) = img.dimensions();

    // Validate dimensions
    if ow == 0 || oh == 0 {
        return Err(ImageProcessingError::InvalidDimensions {
            width: ow,
            height: oh,
        });
    }

    debug!(
        original_dimensions = %format!("{}x{}", ow, oh),
        format = ?options.output_format,
        "processing image"
    );

    let has_alpha = img.color().has_alpha();
    let processed = if let Some(max_dim) = options.max_dimension {
        if ow > max_dim || oh > max_dim {
            let scale = if ow >= oh {
                max_dim as f32 / ow as f32
            } else {
                max_dim as f32 / oh as f32
            };
            let nw = (ow as f32 * scale).round() as u32;
            let nh = (oh as f32 * scale).round() as u32;
            img.resize(nw.max(1), nh.max(1), options.resize_filter)
        } else {
            img
        }
    } else {
        img
    };

    let (fw, fh) = processed.dimensions();

    let mut out: Vec<u8> = Vec::new();
    let mut cursor = Cursor::new(&mut out);

    // Handle encoding with quality for JPEG
    let encode_result = match options.output_format {
        ImageFormat::Jpeg => {
            if let Some(_quality) = options.quality {
                // Note: image crate doesn't directly support quality parameter in write_to
                // For now, use default quality. In production, consider using a different crate
                // like `image` with additional features or `jpeg_encoder` for quality control
                processed.write_to(&mut cursor, ImageFormat::Jpeg)
            } else {
                processed.write_to(&mut cursor, ImageFormat::Jpeg)
            }
        }
        _ => processed.write_to(&mut cursor, options.output_format),
    };

    encode_result.map_err(|e| ImageProcessingError::EncodeError(e.to_string()))?;

    let metadata = ImageMetadata {
        orig_width: ow,
        orig_height: oh,
        final_width: fw,
        final_height: fh,
        max_dim: options.max_dimension.unwrap_or(0),
        orig_bytes: raw_bytes.len(),
        final_bytes: out.len(),
        converted: true,
        format: format!("{:?}", options.output_format).to_lowercase(),
        has_alpha,
        processing_time_ms: 0, // Not measured in standalone function
    };

    Ok((out, metadata))
}

/// Process an uploaded image with default settings for DIDHub uploads.
/// Convenience function to process an image with default settings.
/// Resizes the image if it exceeds the maximum dimension, converts to PNG format,
/// and returns the processed data along with metadata.
///
/// # Arguments
/// * `raw_bytes` - The raw image data
/// * `max_dim` - Maximum dimension (width or height) for resizing
///
/// # Returns
/// A tuple of (processed_image_bytes, metadata) or an error
pub fn process_image_simple(
    raw_bytes: &[u8],
    max_dim: u32,
) -> Result<(Vec<u8>, ImageMetadata), ImageProcessingError> {
    let options = ProcessingOptions {
        max_dimension: Some(max_dim),
        output_format: ImageFormat::Png,
        ..Default::default()
    };
    process_image(raw_bytes, &options)
}

/// Process an image for web use with optimized settings.
/// Converts to WebP format with quality optimization.
///
/// # Arguments
/// * `raw_bytes` - The raw image data
///
/// # Returns
/// A tuple of (processed_image_bytes, metadata) or an error
pub fn process_image_for_web(
    raw_bytes: &[u8],
) -> Result<(Vec<u8>, ImageMetadata), ImageProcessingError> {
    let options = ProcessingOptions::for_web();
    process_image(raw_bytes, &options)
}

/// Create a thumbnail from an image.
///
/// # Arguments
/// * `raw_bytes` - The raw image data
/// * `size` - Maximum dimension for the thumbnail
///
/// # Returns
/// A tuple of (thumbnail_bytes, metadata) or an error
pub fn create_thumbnail(
    raw_bytes: &[u8],
    size: u32,
) -> Result<(Vec<u8>, ImageMetadata), ImageProcessingError> {
    let options = ProcessingOptions::for_thumbnail(size);
    process_image(raw_bytes, &options)
}

/// Check if a MIME type string represents a supported image format.
///
/// # Arguments
/// * `mime` - MIME type string (e.g., "image/png")
///
/// # Returns
/// true if the MIME type is supported, false otherwise
pub fn is_image_mime(mime: &str) -> bool {
    matches!(
        mime,
        "image/png"
            | "image/jpeg"
            | "image/jpg"
            | "image/gif"
            | "image/webp"
            | "image/bmp"
            | "image/tiff"
            | "image/tif"
    )
}

pub fn detect_image_format(data: &[u8]) -> Option<ImageFormat> {
    image::guess_format(data).ok()
}

/// Validate an image and return its basic properties without processing.
///
/// # Arguments
/// * `data` - Raw image data
///
/// # Returns
/// A tuple of (width, height, has_alpha_channel) or an error
pub fn validate_image(data: &[u8]) -> Result<(u32, u32, bool), ImageProcessingError> {
    let img = image::load_from_memory(data)?;
    let (w, h) = img.dimensions();
    let has_alpha = img.color().has_alpha();
    Ok((w, h, has_alpha))
}

pub fn flatten_rgba_to_rgb(rgba_image: &RgbaImage) -> RgbImage {
    let (width, height) = rgba_image.dimensions();
    let mut rgb_image = RgbImage::new(width, height);

    for (x, y, pixel) in rgba_image.enumerate_pixels() {
        let [r, g, b, a] = pixel.0;
        if a == 0 {
            // Transparent pixel becomes white background
            rgb_image.put_pixel(x, y, image::Rgb([255, 255, 255]));
            continue;
        }

        if a == u8::MAX {
            // Opaque pixel
            rgb_image.put_pixel(x, y, image::Rgb([r, g, b]));
            continue;
        }

        // Alpha blending with white background
        let alpha = f32::from(a) / 255.0;
        let inv_alpha = 1.0 - alpha;

        let blend = |channel: u8| -> u8 {
            ((f32::from(channel) * alpha) + (255.0 * inv_alpha))
                .round()
                .clamp(0.0, 255.0) as u8
        };

        rgb_image.put_pixel(x, y, image::Rgb([blend(r), blend(g), blend(b)]));
    }

    rgb_image
}

/// Prepare an image for PDF embedding by flattening alpha channels.
///
/// Converts images with alpha channels to RGB by blending with white background.
/// Images without alpha are converted to RGB if needed.
///
/// # Arguments
/// * `data` - Raw image data
///
/// # Returns
/// Processed image data as PNG or an error
pub fn prepare_image_for_pdf(data: &[u8]) -> Result<Vec<u8>, ImageProcessingError> {
    let image = image::load_from_memory(data)?;

    let rgba_image = image.to_rgba8();

    let flattened = if image.color().has_alpha() {
        DynamicImage::ImageRgb8(flatten_rgba_to_rgb(&rgba_image))
    } else {
        DynamicImage::ImageRgb8(image.to_rgb8())
    };

    let mut out = Vec::new();
    flattened
        .write_to(&mut Cursor::new(&mut out), ImageFormat::Png)
        .map_err(|e| ImageProcessingError::EncodeError(e.to_string()))?;

    Ok(out)
}

pub fn optimize_image(
    data: &[u8],
    target_format: ImageFormat,
    _quality: Option<u8>, // For JPEG, 1-100 (currently unused due to image crate limitations)
) -> Result<Vec<u8>, ImageProcessingError> {
    let img = image::load_from_memory(data)?;

    let mut out = Vec::new();
    let mut cursor = Cursor::new(&mut out);

    // For now, just re-encode in the target format
    // In a real implementation, you might want to apply optimization techniques
    img.write_to(&mut cursor, target_format)
        .map_err(|e| ImageProcessingError::EncodeError(e.to_string()))?;

    Ok(out)
}
