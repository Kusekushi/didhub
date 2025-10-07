# image-processor

A flexible and configurable image processing library for Rust applications.
Provides comprehensive image manipulation capabilities including resizing,
format conversion, validation, optimization, and PDF preparation.

## Features

- **Flexible Processing**: Configurable resize algorithms, output formats, and quality settings
- **Format Support**: PNG, JPEG, GIF, WebP, BMP, TIFF input/output
- **Validation**: Comprehensive image validation with size and dimension checks
- **PDF Integration**: Alpha channel flattening for PDF embedding
- **Error Handling**: Detailed error types with `thiserror`
- **Async Ready**: Designed for both synchronous and asynchronous workflows
- **Multiple APIs**: Object-oriented `ImageProcessor` and functional APIs

## Installation

Add this to your `Cargo.toml`:

```toml
[dependencies]
image-processor = "0.1"
```

## Quick Start

### Using the ImageProcessor (Recommended)

```rust
use image_processor::{ImageProcessor, ProcessingOptions, ImageFormat};

let processor = ImageProcessor::new();

// Process with default settings
let image_data = std::fs::read("input.jpg")?;
let result = processor.process(&image_data)?;

println!("Processed image: {}x{}", result.metadata.final_width, result.metadata.final_height);

// Process with custom options
let options = ProcessingOptions {
    max_dimension: Some(1024),
    output_format: ImageFormat::WebP,
    quality: Some(85),
    ..Default::default()
};
let result = processor.process_with_options(&image_data, &options)?;
```

### Functional API

```rust
use image_processor::{process_image, process_image_simple, ProcessingOptions};

// Simple processing
let (data, metadata) = process_image_simple(&image_data, 2048)?;

// Advanced processing
let options = ProcessingOptions::for_web();
let (data, metadata) = process_image(&image_data, &options)?;
```

## API Overview

### ImageProcessor

The main interface for image processing with configurable defaults:

```rust
let processor = ImageProcessor::with_options(ProcessingOptions::for_web());
```

### ProcessingOptions

Configure how images are processed:

```rust
let options = ProcessingOptions {
    max_dimension: Some(1920),        // Resize if larger than 1920px
    target_width: None,               // Exact width (optional)
    target_height: None,              // Exact height (optional)
    output_format: ImageFormat::WebP, // Output format
    quality: Some(85),                // JPEG/WebP quality (1-100)
    resize_filter: image::imageops::FilterType::Lanczos3, // Resize algorithm
    max_file_size: Some(10 * 1024 * 1024), // 10MB limit
    maintain_aspect_ratio: true,      // Keep aspect ratio
    background_color: Some([255, 255, 255]), // Background for padding
    strip_metadata: false,            // Keep EXIF data
};
```

### Preset Options

```rust
// Web optimization (WebP, quality 85, max 1920px)
let web_options = ProcessingOptions::for_web();

// Thumbnails (JPEG, quality 80, custom size)
let thumb_options = ProcessingOptions::for_thumbnail(300);

// Exact dimensions (may crop or pad)
let exact_options = ProcessingOptions::exact_dimensions(800, 600);
```

## Convenience Functions

```rust
use image_processor::{process_image_simple, process_image_for_web, create_thumbnail};

// Basic processing with size limit
let (data, meta) = process_image_simple(&image_data, 2048)?;

// Web-optimized processing
let (data, meta) = process_image_for_web(&image_data)?;

// Create thumbnail
let (data, meta) = create_thumbnail(&image_data, 150)?;
```

## Image Validation

```rust
use image_processor::validate_image;

let (width, height, has_alpha) = validate_image(&image_data)?;
```

## PDF Preparation

```rust
use image_processor::prepare_image_for_pdf;

let pdf_ready_data = prepare_image_for_pdf(&image_data)?;
```

## MIME Type Checking

```rust
use image_processor::is_image_mime;

if is_image_mime("image/png") {
    // Handle image
}
```

## Error Handling

The crate uses `thiserror` for comprehensive error types:

```rust
use image_processor::ImageProcessingError;

match processor.process(&data) {
    Ok(result) => {
        println!("Success: {} bytes", result.data.len());
    }
    Err(ImageProcessingError::TooLarge { size, max_size }) => {
        eprintln!("Image too large: {} > {}", size, max_size);
    }
    Err(ImageProcessingError::InvalidDimensions { width, height }) => {
        eprintln!("Invalid dimensions: {}x{}", width, height);
    }
    Err(e) => eprintln!("Processing failed: {}", e),
}
```

## Performance

- **Memory Efficient**: Processes images in memory without temporary files
- **Fast**: Optimized resize algorithms with multiple filter options
- **Configurable**: Balance quality vs speed with filter selection
- **Measured**: Processing time included in metadata

## Dependencies

- `image`: Core image processing (PNG, JPEG, GIF, WebP support)
- `serde`: Serialization for metadata
- `thiserror`: Structured error handling
- `tracing`: Debug logging and instrumentation

## Testing

Run the test suite:

```bash
cargo test --package image-processor
```

## Contributing

Contributions welcome! Please:

1. Add tests for new features
2. Update documentation
3. Follow Rust best practices
4. Ensure all tests pass

## License

MIT OR Apache-2.0
- `thiserror`: Error handling
- `tracing`: Logging

## Notes

- JPEG quality control is currently limited by the `image` crate's capabilities
- For production use with advanced JPEG compression, consider additional crates like `jpeg_encoder`
- All operations are synchronous; consider wrapping in `tokio::task::spawn_blocking` for async contexts