const std = @import("std");
const schema = @import("schema.zig");
const config = @import("../config.zig");

/// Validation error
pub const ValidationError = struct {
    field_path: []const u8,
    message: []const u8,
};

/// Validation result
pub const ValidationResult = union(enum) {
    valid,
    invalid: []ValidationError,
};

/// Validate a configuration against the schema
pub fn validateConfig(allocator: std.mem.Allocator, cfg: *const config.Config) !ValidationResult {
    var errors = std.ArrayList(ValidationError).initCapacity(allocator, 0);
    defer errors.deinit();

    // Validate server section
    validateServerSection(&errors, &cfg.server);
    validateLoggingSection(&errors, &cfg.logging);
    validateCorsSection(&errors, &cfg.cors);
    validateDatabaseSection(&errors, &cfg.database);
    validateUploadsSection(&errors, &cfg.uploads);
    validateAutoUpdateSection(&errors, &cfg.auto_update);
    validateRateLimitSection(&errors, &cfg.rate_limit);
    validateAuthSection(&errors, &cfg.auth);

    if (errors.items.len > 0) {
        return ValidationResult{ .invalid = try errors.toOwnedSlice() };
    }

    return ValidationResult.valid;
}

fn validateServerSection(errors: *std.ArrayList(ValidationError), server: *const config.ServerConfig) void {
    // Host validation
    if (server.host.len == 0) {
        try errors.append(ValidationError{
            .field_path = "server.host",
            .message = "Host cannot be empty",
        });
    } else if (server.host.len > 253) {
        try errors.append(ValidationError{
            .field_path = "server.host",
            .message = "Host name too long (max 253 characters)",
        });
    }

    // Port validation
    if (server.port == 0) {
        try errors.append(ValidationError{
            .field_path = "server.port",
            .message = "Port must be greater than 0",
        });
    } else if (server.port > 65535) {
        try errors.append(ValidationError{
            .field_path = "server.port",
            .message = "Port must be less than or equal to 65535",
        });
    }
}

fn validateLoggingSection(errors: *std.ArrayList(ValidationError), logging: *const config.LoggingConfig) void {
    // Level validation
    const valid_levels = [_][]const u8{ "trace", "debug", "info", "warn", "error" };
    var is_valid = false;
    for (valid_levels) |level| {
        if (std.mem.eql(u8, logging.level, level)) {
            is_valid = true;
            break;
        }
    }
    if (!is_valid) {
        try errors.append(ValidationError{
            .field_path = "logging.level",
            .message = "Log level must be one of: trace, debug, info, warn, error",
        });
    }
}

fn validateCorsSection(errors: *std.ArrayList(ValidationError), cors: *const config.CorsConfig) void {
    _ = errors;
    _ = cors;
    // CORS validation - currently no specific validation rules
}

fn validateDatabaseSection(errors: *std.ArrayList(ValidationError), database: *const config.DatabaseConfig) void {
    // Driver validation
    const valid_drivers = [_][]const u8{ "sqlite", "postgres", "mysql" };
    var is_valid = false;
    for (valid_drivers) |driver| {
        if (std.mem.eql(u8, database.driver, driver)) {
            is_valid = true;
            break;
        }
    }
    if (!is_valid) {
        try errors.append(ValidationError{
            .field_path = "database.driver",
            .message = "Database driver must be one of: sqlite, postgres, mysql",
        });
    }

    // SQLite-specific validation
    if (database.isSqlite()) {
        if (database.path == null or database.path.?.len == 0) {
            try errors.append(ValidationError{
                .field_path = "database.path",
                .message = "Database path is required for SQLite",
            });
        }
    } else {
        // Non-SQLite validation
        if (database.host == null or database.host.?.len == 0) {
            try errors.append(ValidationError{
                .field_path = "database.host",
                .message = "Database host is required for PostgreSQL/MySQL",
            });
        }
        if (database.port == null) {
            try errors.append(ValidationError{
                .field_path = "database.port",
                .message = "Database port is required for PostgreSQL/MySQL",
            });
        }
        if (database.database == null or database.database.?.len == 0) {
            try errors.append(ValidationError{
                .field_path = "database.database",
                .message = "Database name is required for PostgreSQL/MySQL",
            });
        }
    }
}

fn validateUploadsSection(errors: *std.ArrayList(ValidationError), uploads: *const config.UploadsConfig) void {
    if (uploads.directory.len == 0) {
        try errors.append(ValidationError{
            .field_path = "uploads.directory",
            .message = "Upload directory cannot be empty",
        });
    }
}

fn validateAutoUpdateSection(errors: *std.ArrayList(ValidationError), autoupdate: *const config.AutoUpdateConfig) void {
    if (autoupdate.check_interval_hours == 0) {
        try errors.append(ValidationError{
            .field_path = "auto_update.check_interval_hours",
            .message = "Check interval must be greater than 0",
        });
    } else if (autoupdate.check_interval_hours > 168) {
        try errors.append(ValidationError{
            .field_path = "auto_update.check_interval_hours",
            .message = "Check interval must be less than or equal to 168 hours (1 week)",
        });
    }
}

fn validateRateLimitSection(errors: *std.ArrayList(ValidationError), ratelimit: *const config.RateLimitConfig) void {
    if (ratelimit.rate_per_sec == 0) {
        try errors.append(ValidationError{
            .field_path = "rate_limit.rate_per_sec",
            .message = "Rate per second must be greater than 0",
        });
    } else if (ratelimit.rate_per_sec > 10000) {
        try errors.append(ValidationError{
            .field_path = "rate_limit.rate_per_sec",
            .message = "Rate per second must be less than or equal to 10000",
        });
    }

    if (ratelimit.burst == 0) {
        try errors.append(ValidationError{
            .field_path = "rate_limit.burst",
            .message = "Burst capacity must be greater than 0",
        });
    } else if (ratelimit.burst > 100000) {
        try errors.append(ValidationError{
            .field_path = "rate_limit.burst",
            .message = "Burst capacity must be less than or equal to 100000",
        });
    }
}

fn validateAuthSection(errors: *std.ArrayList(ValidationError), auth: *const config.AuthConfig) void {
    _ = errors;
    _ = auth;
    // Auth validation - currently no specific validation rules
    // Could add validation for JWT format, file existence, etc.
}
