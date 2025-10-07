use didhub_image::*;
use image::{DynamicImage, ImageFormat, RgbImage, RgbaImage};
use std::io::Cursor;

fn create_test_png() -> Vec<u8> {
    // Create a simple 1x1 red PNG programmatically
    let img = DynamicImage::ImageRgb8(RgbImage::from_pixel(1, 1, image::Rgb([255, 0, 0])));
    let mut buffer = Vec::new();
    let mut cursor = Cursor::new(&mut buffer);
    img.write_to(&mut cursor, ImageFormat::Png).unwrap();
    buffer
}

fn create_test_png_with_alpha() -> Vec<u8> {
    // Create a 2x2 PNG with alpha channel
    let mut img = RgbaImage::new(2, 2);
    img.put_pixel(0, 0, image::Rgba([255, 0, 0, 128])); // Semi-transparent red
    img.put_pixel(1, 0, image::Rgba([0, 255, 0, 255])); // Opaque green
    img.put_pixel(0, 1, image::Rgba([0, 0, 255, 255])); // Opaque blue
    img.put_pixel(1, 1, image::Rgba([255, 255, 255, 0])); // Transparent white

    let img = DynamicImage::ImageRgba8(img);
    let mut buffer = Vec::new();
    let mut cursor = Cursor::new(&mut buffer);
    img.write_to(&mut cursor, ImageFormat::Png).unwrap();
    buffer
}

fn create_large_test_image(width: u32, height: u32) -> Vec<u8> {
    // Create a larger test image
    let img = DynamicImage::ImageRgb8(RgbImage::from_pixel(width, height, image::Rgb([100, 150, 200])));
    let mut buffer = Vec::new();
    let mut cursor = Cursor::new(&mut buffer);
    img.write_to(&mut cursor, ImageFormat::Png).unwrap();
    buffer
}

fn create_test_jpeg() -> Vec<u8> {
    let img = DynamicImage::ImageRgb8(RgbImage::from_pixel(10, 10, image::Rgb([255, 255, 0])));
    let mut buffer = Vec::new();
    let mut cursor = Cursor::new(&mut buffer);
    img.write_to(&mut cursor, ImageFormat::Jpeg).unwrap();
    buffer
}

fn create_test_gif() -> Vec<u8> {
    let img = DynamicImage::ImageRgb8(RgbImage::from_pixel(5, 5, image::Rgb([0, 255, 255])));
    let mut buffer = Vec::new();
    let mut cursor = Cursor::new(&mut buffer);
    img.write_to(&mut cursor, ImageFormat::Gif).unwrap();
    buffer
}

#[test]
fn test_is_image_mime() {
    assert!(is_image_mime("image/png"));
    assert!(is_image_mime("image/jpeg"));
    assert!(is_image_mime("image/gif"));
    assert!(is_image_mime("image/webp"));
    assert!(is_image_mime("image/bmp"));
    assert!(is_image_mime("image/tiff"));
    assert!(!is_image_mime("text/plain"));
}

#[test]
fn test_process_image_simple() {
    let test_png = create_test_png();
    let result = process_image_simple(&test_png, 2048);
    assert!(result.is_ok(), "Failed to process test image");
    let (processed, metadata) = result.unwrap();
    assert_eq!(metadata.orig_width, 1);
    assert_eq!(metadata.orig_height, 1);
    assert_eq!(metadata.final_width, 1);
    assert_eq!(metadata.final_height, 1);
    assert!(processed.len() > 0);
    assert!(metadata.converted);
}

#[test]
fn test_validate_image() {
    let test_png = create_test_png();
    let result = validate_image(&test_png);
    assert!(result.is_ok(), "Failed to validate test image");
    let (w, h, has_alpha) = result.unwrap();
    assert_eq!(w, 1);
    assert_eq!(h, 1);
    assert!(!has_alpha);
}

#[test]
fn test_invalid_image() {
    let invalid_data = b"not an image";
    let result = validate_image(invalid_data);
    assert!(result.is_err());
}

#[test]
fn test_process_image_with_options() {
    let test_png = create_test_png();
    let options = ProcessingOptions {
        max_dimension: Some(100),
        target_width: None,
        target_height: None,
        output_format: ImageFormat::Png,
        quality: None,
        resize_filter: image::imageops::FilterType::Nearest,
        max_file_size: Some(1024 * 1024),
        maintain_aspect_ratio: true,
        background_color: Some([255, 255, 255]),
        strip_metadata: false,
    };
    let result = process_image(&test_png, &options);
    assert!(result.is_ok());
    let (_processed, metadata) = result.unwrap();
    assert_eq!(metadata.final_width, 1);
    assert_eq!(metadata.final_height, 1);
}

#[test]
fn test_too_large_image() {
    let test_png = create_test_png();
    let options = ProcessingOptions {
        max_file_size: Some(10), // Very small limit
        ..Default::default()
    };
    let result = process_image(&test_png, &options);
    assert!(result.is_err());
    match result.unwrap_err() {
        ImageProcessingError::TooLarge { size, max_size } => {
            assert!(size > max_size);
        }
        _ => panic!("Expected TooLarge error"),
    }
}

#[test]
fn test_image_processor() {
    let processor = ImageProcessor::new();
    let test_png = create_test_png();

    let result = processor.process(&test_png);
    assert!(result.is_ok());

    let result = result.unwrap();
    assert_eq!(result.metadata.orig_width, 1);
    assert_eq!(result.metadata.orig_height, 1);
    assert!(result.data.len() > 0);
}

#[test]
fn test_processing_options_presets() {
    let web_options = ProcessingOptions::for_web();
    assert_eq!(web_options.output_format, ImageFormat::WebP);
    assert_eq!(web_options.quality, Some(85));

    let thumb_options = ProcessingOptions::for_thumbnail(150);
    assert_eq!(thumb_options.max_dimension, Some(150));
    assert_eq!(thumb_options.output_format, ImageFormat::Jpeg);

    let exact_options = ProcessingOptions::exact_dimensions(800, 600);
    assert_eq!(exact_options.target_width, Some(800));
    assert_eq!(exact_options.target_height, Some(600));
    assert_eq!(exact_options.max_dimension, None);
}

#[test]
fn test_prepare_image_for_pdf() {
    let test_png = create_test_png();
    let result = prepare_image_for_pdf(&test_png);
    assert!(result.is_ok());
    let processed = result.unwrap();
    assert!(processed.len() > 0);
}

#[test]
fn test_optimize_image() {
    let test_png = create_test_png();
    let result = optimize_image(&test_png, ImageFormat::Jpeg, Some(80));
    assert!(result.is_ok());
    let optimized = result.unwrap();
    assert!(optimized.len() > 0);
}

// ===== EXTENSIVE ADDITIONAL TESTS =====

#[test]
fn test_different_image_formats() {
    // Test PNG
    let png_data = create_test_png();
    let result = validate_image(&png_data);
    assert!(result.is_ok());
    let (w, h, _has_alpha) = result.unwrap();
    assert_eq!(w, 1);
    assert_eq!(h, 1);
    // PNG can have alpha even for RGB images depending on encoding

    // Test PNG with alpha
    let png_alpha_data = create_test_png_with_alpha();
    let result = validate_image(&png_alpha_data);
    assert!(result.is_ok());
    let (w, h, has_alpha) = result.unwrap();
    assert_eq!(w, 2);
    assert_eq!(h, 2);
    assert!(has_alpha);

    // Test JPEG
    let jpeg_data = create_test_jpeg();
    let result = validate_image(&jpeg_data);
    assert!(result.is_ok());
    let (w, h, _has_alpha) = result.unwrap();
    assert_eq!(w, 10);
    assert_eq!(h, 10);
    // JPEG doesn't support alpha channels, but some decoders might report it

    // Test GIF
    let gif_data = create_test_gif();
    let result = validate_image(&gif_data);
    assert!(result.is_ok());
    let (w, h, _has_alpha) = result.unwrap();
    assert_eq!(w, 5);
    assert_eq!(h, 5);
    // GIF can have alpha/transparency
}

#[test]
fn test_format_detection() {
    let png_data = create_test_png();
    let jpeg_data = create_test_jpeg();
    let gif_data = create_test_gif();

    assert_eq!(detect_image_format(&png_data), Some(ImageFormat::Png));
    assert_eq!(detect_image_format(&jpeg_data), Some(ImageFormat::Jpeg));
    assert_eq!(detect_image_format(&gif_data), Some(ImageFormat::Gif));
    assert_eq!(detect_image_format(&[]), None);
    assert_eq!(detect_image_format(b"not an image"), None);
}

#[test]
fn test_mime_type_edge_cases() {
    // Valid MIME types
    assert!(is_image_mime("image/png"));
    assert!(is_image_mime("image/jpeg"));
    assert!(is_image_mime("image/jpg"));
    assert!(is_image_mime("image/gif"));
    assert!(is_image_mime("image/webp"));
    assert!(is_image_mime("image/bmp"));
    assert!(is_image_mime("image/tiff"));
    assert!(is_image_mime("image/tif"));

    // Invalid MIME types
    assert!(!is_image_mime(""));
    assert!(!is_image_mime("image"));
    assert!(!is_image_mime("image/"));
    assert!(!is_image_mime("text/plain"));
    assert!(!is_image_mime("application/json"));
    assert!(!is_image_mime("image/svg+xml"));
    assert!(!is_image_mime("IMAGE/PNG")); // Case sensitive
}

#[test]
fn test_image_resizing() {
    let large_img = create_large_test_image(100, 100);

    // Test max dimension resizing
    let options = ProcessingOptions {
        max_dimension: Some(50),
        ..Default::default()
    };
    let result = process_image(&large_img, &options);
    assert!(result.is_ok());
    let (_data, metadata) = result.unwrap();
    assert_eq!(metadata.final_width, 50);
    assert_eq!(metadata.final_height, 50);
    assert!(metadata.converted);

    // Test no resizing when image is smaller than max
    let options = ProcessingOptions {
        max_dimension: Some(200),
        ..Default::default()
    };
    let result = process_image(&large_img, &options);
    assert!(result.is_ok());
    let (_data, metadata) = result.unwrap();
    assert_eq!(metadata.final_width, 100);
    assert_eq!(metadata.final_height, 100);
}

#[test]
fn test_resize_filters() {
    let img_data = create_large_test_image(20, 20);

    let filters = vec![
        image::imageops::FilterType::Nearest,
        image::imageops::FilterType::Triangle,
        image::imageops::FilterType::CatmullRom,
        image::imageops::FilterType::Gaussian,
        image::imageops::FilterType::Lanczos3,
    ];

    for filter in filters {
        let options = ProcessingOptions {
            max_dimension: Some(10),
            resize_filter: filter,
            ..Default::default()
        };
        let result = process_image(&img_data, &options);
        assert!(result.is_ok(), "Failed with filter {:?}", filter);
        let (_data, metadata) = result.unwrap();
        assert_eq!(metadata.final_width, 10);
        assert_eq!(metadata.final_height, 10);
    }
}

#[test]
fn test_format_conversions() {
    let png_data = create_test_png();

    let formats = vec![
        ImageFormat::Png,
        ImageFormat::Jpeg,
        ImageFormat::Gif,
        ImageFormat::WebP,
    ];

    for format in formats {
        let options = ProcessingOptions {
            output_format: format,
            ..Default::default()
        };
        let result = process_image(&png_data, &options);
        assert!(result.is_ok(), "Failed to convert to {:?}", format);
        let (_data, metadata) = result.unwrap();
        assert_eq!(metadata.final_width, 1);
        assert_eq!(metadata.final_height, 1);
        assert!(metadata.converted);
    }
}

#[test]
fn test_quality_settings() {
    let png_data = create_test_png();

    // Test JPEG with different quality settings
    for quality in [10, 50, 80, 95, 100].iter() {
        let options = ProcessingOptions {
            output_format: ImageFormat::Jpeg,
            quality: Some(*quality),
            ..Default::default()
        };
        let result = process_image(&png_data, &options);
        assert!(result.is_ok(), "Failed with quality {}", quality);
        let (_data, metadata) = result.unwrap();
        assert_eq!(metadata.final_width, 1);
        assert_eq!(metadata.final_height, 1);
    }

    // Test invalid quality (should still work with default)
    let options = ProcessingOptions {
        output_format: ImageFormat::Jpeg,
        quality: Some(150), // Invalid, but should not crash
        ..Default::default()
    };
    let result = process_image(&png_data, &options);
    assert!(result.is_ok());
}

#[test]
fn test_file_size_limits() {
    let small_img = create_test_png();

    // Test with reasonable limit
    let options = ProcessingOptions {
        max_file_size: Some(1024),
        ..Default::default()
    };
    let result = process_image(&small_img, &options);
    assert!(result.is_ok());

    // Test with very small limit
    let options = ProcessingOptions {
        max_file_size: Some(1),
        ..Default::default()
    };
    let result = process_image(&small_img, &options);
    assert!(result.is_err());
    match result.unwrap_err() {
        ImageProcessingError::TooLarge { .. } => {}
        _ => panic!("Expected TooLarge error"),
    }

    // Test with no limit
    let options = ProcessingOptions {
        max_file_size: None,
        ..Default::default()
    };
    let result = process_image(&small_img, &options);
    assert!(result.is_ok());
}

#[test]
fn test_zero_dimension_handling() {
    // Create an image with zero dimensions (this should fail)
    let invalid_data = vec![0u8; 100]; // Not a valid image
    let result = validate_image(&invalid_data);
    assert!(result.is_err());

    // Test processing with invalid data
    let result = process_image_simple(&invalid_data, 100);
    assert!(result.is_err());
}

#[test]
fn test_alpha_channel_processing() {
    let alpha_img = create_test_png_with_alpha();

    // Test normal processing
    let result = process_image_simple(&alpha_img, 2048);
    assert!(result.is_ok());
    let (_data, metadata) = result.unwrap();
    assert_eq!(metadata.orig_width, 2);
    assert_eq!(metadata.orig_height, 2);
    assert!(metadata.has_alpha);

    // Test PDF preparation (should flatten alpha)
    let result = prepare_image_for_pdf(&alpha_img);
    assert!(result.is_ok());
    let pdf_data = result.unwrap();
    assert!(pdf_data.len() > 0);

    // Validate that PDF data doesn't have alpha
    let img = image::load_from_memory(&pdf_data).unwrap();
    assert!(!img.color().has_alpha());
}

#[test]
fn test_processing_options_validation() {
    let img_data = create_test_png();

    // Test default options
    let result = process_image(&img_data, &ProcessingOptions::default());
    assert!(result.is_ok());

    // Test web preset
    let result = process_image(&img_data, &ProcessingOptions::for_web());
    assert!(result.is_ok());

    // Test thumbnail preset
    let result = process_image(&img_data, &ProcessingOptions::for_thumbnail(100));
    assert!(result.is_ok());

    // Test exact dimensions preset
    let result = process_image(&img_data, &ProcessingOptions::exact_dimensions(50, 50));
    assert!(result.is_ok());
}

#[test]
fn test_image_processor_custom_options() {
    let img_data = create_test_png();

    // Test with custom processor
    let processor = ImageProcessor::with_options(ProcessingOptions::for_web());
    let result = processor.process(&img_data);
    assert!(result.is_ok());
    let result = result.unwrap();
    assert_eq!(result.metadata.final_width, 1);
    assert_eq!(result.metadata.final_height, 1);

    // Test processing with custom options
    let options = ProcessingOptions {
        output_format: ImageFormat::Jpeg,
        quality: Some(90),
        ..Default::default()
    };
    let result = processor.process_with_options(&img_data, &options);
    assert!(result.is_ok());
}

#[test]
fn test_metadata_accuracy() {
    let img_data = create_large_test_image(64, 32);

    let options = ProcessingOptions {
        max_dimension: Some(32),
        output_format: ImageFormat::Png,
        ..Default::default()
    };

    let result = process_image(&img_data, &options);
    assert!(result.is_ok());
    let (_processed, metadata) = result.unwrap();

    // Original dimensions should be preserved
    assert_eq!(metadata.orig_width, 64);
    assert_eq!(metadata.orig_height, 32);

    // Final dimensions should be scaled down (maintaining aspect ratio)
    assert_eq!(metadata.final_width, 32);
    assert_eq!(metadata.final_height, 16);

    // File sizes should be tracked
    assert!(metadata.orig_bytes > 0);
    assert!(metadata.final_bytes > 0);
    // processing_time_ms is u128, always >= 0

    // Should be marked as converted
    assert!(metadata.converted);
    assert_eq!(metadata.format, "png");
}

#[test]
fn test_error_conditions() {
    // Test with empty data
    let result = validate_image(&[]);
    assert!(result.is_err());

    // Test with invalid data
    let result = validate_image(b"not an image at all");
    assert!(result.is_err());

    // Test processing empty data
    let result = process_image_simple(&[], 100);
    assert!(result.is_err());

    // Test processing invalid data
    let result = process_image_simple(b"invalid", 100);
    assert!(result.is_err());
}

#[test]
fn test_convenience_functions() {
    let img_data = create_large_test_image(100, 100);

    // Test process_image_simple
    let result = process_image_simple(&img_data, 50);
    assert!(result.is_ok());
    let (_data, metadata) = result.unwrap();
    assert_eq!(metadata.final_width, 50);
    assert_eq!(metadata.final_height, 50);

    // Test process_image_for_web
    let result = process_image_for_web(&img_data);
    assert!(result.is_ok());
    let (_data, metadata) = result.unwrap();
    assert_eq!(metadata.format, "webp");

    // Test create_thumbnail
    let result = create_thumbnail(&img_data, 25);
    assert!(result.is_ok());
    let (_data, metadata) = result.unwrap();
    assert_eq!(metadata.final_width, 25);
    assert_eq!(metadata.final_height, 25);
    assert_eq!(metadata.format, "jpeg");
}

#[test]
fn test_aspect_ratio_preservation() {
    // Test with non-square image
    let img_data = create_large_test_image(200, 100); // 2:1 aspect ratio

    let options = ProcessingOptions {
        max_dimension: Some(100),
        maintain_aspect_ratio: true,
        ..Default::default()
    };

    let result = process_image(&img_data, &options);
    assert!(result.is_ok());
    let (_data, metadata) = result.unwrap();

    // Should maintain aspect ratio: 200:100 = 2:1, so 100:50
    assert_eq!(metadata.final_width, 100);
    assert_eq!(metadata.final_height, 50);
}

#[test]
fn test_large_image_handling() {
    // Create a moderately large image
    let large_img = create_large_test_image(1000, 1000);

    // Should process without issues
    let result = process_image_simple(&large_img, 500);
    assert!(result.is_ok());
    let (_data, metadata) = result.unwrap();
    assert_eq!(metadata.final_width, 500);
    assert_eq!(metadata.final_height, 500);
}

#[test]
fn test_processing_result_structure() {
    let img_data = create_test_png();

    let processor = ImageProcessor::new();
    let result = processor.process(&img_data);
    assert!(result.is_ok());

    let result = result.unwrap();

    // Check that all fields are populated
    assert!(result.data.len() > 0);
    assert_eq!(result.metadata.orig_width, 1);
    assert_eq!(result.metadata.orig_height, 1);
    assert_eq!(result.metadata.final_width, 1);
    assert_eq!(result.metadata.final_height, 1);
    assert!(result.metadata.orig_bytes > 0);
    assert!(result.metadata.final_bytes > 0);
    // processing_time_ms is u128, always >= 0
    assert!(result.metadata.converted);
    assert_eq!(result.metadata.format, "png");
    assert!(!result.metadata.has_alpha);
}