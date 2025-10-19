const std = @import("std");

/// Field types for configuration schema
pub const FieldType = enum {
    string,
    int,
    uint,
    bool,
    string_list,
    optional_string,
    optional_int,
    optional_uint,
};

/// Configuration field definition
pub const Field = struct {
    name: []const u8,
    type: FieldType,
    description: []const u8,
    default_value: []const u8,
    validation_rules: []const ValidationRule,

    pub const ValidationRule = union(enum) {
        min_length: usize,
        max_length: usize,
        min_value: i64,
        max_value: i64,
        pattern: []const u8,
        one_of: []const []const u8,
    };
};

/// Configuration section definition
pub const Section = struct {
    name: []const u8,
    description: []const u8,
    fields: []const Field,
};

/// Complete configuration schema
pub const ConfigSchema = struct {
    sections: []const Section,

    pub fn getSection(self: ConfigSchema, name: []const u8) ?Section {
        for (self.sections) |section| {
            if (std.mem.eql(u8, section.name, name)) {
                return section;
            }
        }
        return null;
    }

    pub fn getField(self: ConfigSchema, section_name: []const u8, field_name: []const u8) ?Field {
        const section = self.getSection(section_name) orelse return null;
        for (section.fields) |field| {
            if (std.mem.eql(u8, field.name, field_name)) {
                return field;
            }
        }
        return null;
    }
};

// Schema definitions for each configuration section
pub const server_schema = Section{
    .name = "server",
    .description = "Server configuration",
    .fields = &[_]Field{
        .{
            .name = "host",
            .type = .string,
            .description = "Server host address to bind to",
            .default_value = "0.0.0.0",
            .validation_rules = &[_]Field.ValidationRule{
                .{ .min_length = 1 },
                .{ .max_length = 253 }, // Max hostname length
            },
        },
        .{
            .name = "port",
            .type = .uint,
            .description = "Server port to listen on",
            .default_value = "6000",
            .validation_rules = &[_]Field.ValidationRule{
                .{ .min_value = 1 },
                .{ .max_value = 65535 },
            },
        },
    },
};

pub const logging_schema = Section{
    .name = "logging",
    .description = "Logging configuration",
    .fields = &[_]Field{
        .{
            .name = "level",
            .type = .string,
            .description = "Log level (trace, debug, info, warn, error)",
            .default_value = "info",
            .validation_rules = &[_]Field.ValidationRule{
                .{ .one_of = &[_][]const u8{ "trace", "debug", "info", "warn", "error" } },
            },
        },
        .{
            .name = "json",
            .type = .bool,
            .description = "Output logs in JSON format",
            .default_value = "false",
            .validation_rules = &[_]Field.ValidationRule{},
        },
    },
};

pub const cors_schema = Section{
    .name = "cors",
    .description = "CORS configuration",
    .fields = &[_]Field{
        .{
            .name = "allowed_origins",
            .type = .string_list,
            .description = "List of allowed CORS origins",
            .default_value = "[]",
            .validation_rules = &[_]Field.ValidationRule{},
        },
        .{
            .name = "allow_all_origins",
            .type = .bool,
            .description = "Allow all origins (overrides allowed_origins)",
            .default_value = "false",
            .validation_rules = &[_]Field.ValidationRule{},
        },
    },
};

pub const database_schema = Section{
    .name = "database",
    .description = "Database configuration",
    .fields = &[_]Field{
        .{
            .name = "driver",
            .type = .string,
            .description = "Database driver (sqlite, postgres, mysql)",
            .default_value = "sqlite",
            .validation_rules = &[_]Field.ValidationRule{
                .{ .one_of = &[_][]const u8{ "sqlite", "postgres", "mysql" } },
            },
        },
        .{
            .name = "path",
            .type = .optional_string,
            .description = "Database file path (for SQLite)",
            .default_value = "didhub.sqlite",
            .validation_rules = &[_]Field.ValidationRule{},
        },
        .{
            .name = "host",
            .type = .optional_string,
            .description = "Database host (for PostgreSQL/MySQL)",
            .default_value = "null",
            .validation_rules = &[_]Field.ValidationRule{},
        },
        .{
            .name = "port",
            .type = .optional_uint,
            .description = "Database port (for PostgreSQL/MySQL)",
            .default_value = "null",
            .validation_rules = &[_]Field.ValidationRule{
                .{ .min_value = 1 },
                .{ .max_value = 65535 },
            },
        },
        .{
            .name = "database",
            .type = .optional_string,
            .description = "Database name (for PostgreSQL/MySQL)",
            .default_value = "null",
            .validation_rules = &[_]Field.ValidationRule{},
        },
        .{
            .name = "username",
            .type = .optional_string,
            .description = "Database username",
            .default_value = "null",
            .validation_rules = &[_]Field.ValidationRule{},
        },
        .{
            .name = "password",
            .type = .optional_string,
            .description = "Database password",
            .default_value = "null",
            .validation_rules = &[_]Field.ValidationRule{},
        },
        .{
            .name = "ssl_mode",
            .type = .optional_string,
            .description = "SSL mode for database connection",
            .default_value = "null",
            .validation_rules = &[_]Field.ValidationRule{},
        },
    },
};

pub const uploads_schema = Section{
    .name = "uploads",
    .description = "File upload configuration",
    .fields = &[_]Field{
        .{
            .name = "directory",
            .type = .string,
            .description = "Directory for file uploads",
            .default_value = "./uploads",
            .validation_rules = &[_]Field.ValidationRule{
                .{ .min_length = 1 },
            },
        },
    },
};

pub const autoupdate_schema = Section{
    .name = "auto_update",
    .description = "Auto-update configuration",
    .fields = &[_]Field{
        .{
            .name = "enabled",
            .type = .bool,
            .description = "Enable automatic updates",
            .default_value = "false",
            .validation_rules = &[_]Field.ValidationRule{},
        },
        .{
            .name = "check_enabled",
            .type = .bool,
            .description = "Enable update checking",
            .default_value = "false",
            .validation_rules = &[_]Field.ValidationRule{},
        },
        .{
            .name = "repo",
            .type = .optional_string,
            .description = "Git repository URL for updates",
            .default_value = "null",
            .validation_rules = &[_]Field.ValidationRule{},
        },
        .{
            .name = "check_interval_hours",
            .type = .uint,
            .description = "Hours between update checks",
            .default_value = "24",
            .validation_rules = &[_]Field.ValidationRule{
                .{ .min_value = 1 },
                .{ .max_value = 168 }, // 1 week
            },
        },
    },
};

pub const ratelimit_schema = Section{
    .name = "rate_limit",
    .description = "Rate limiting configuration",
    .fields = &[_]Field{
        .{
            .name = "enabled",
            .type = .bool,
            .description = "Enable rate limiting",
            .default_value = "false",
            .validation_rules = &[_]Field.ValidationRule{},
        },
        .{
            .name = "per_ip",
            .type = .bool,
            .description = "Rate limit per IP address",
            .default_value = "true",
            .validation_rules = &[_]Field.ValidationRule{},
        },
        .{
            .name = "per_user",
            .type = .bool,
            .description = "Rate limit per user",
            .default_value = "true",
            .validation_rules = &[_]Field.ValidationRule{},
        },
        .{
            .name = "rate_per_sec",
            .type = .uint,
            .description = "Requests per second allowed",
            .default_value = "100",
            .validation_rules = &[_]Field.ValidationRule{
                .{ .min_value = 1 },
                .{ .max_value = 10000 },
            },
        },
        .{
            .name = "burst",
            .type = .uint,
            .description = "Burst capacity for rate limiting",
            .default_value = "200",
            .validation_rules = &[_]Field.ValidationRule{
                .{ .min_value = 1 },
                .{ .max_value = 100000 },
            },
        },
        .{
            .name = "exempt_paths",
            .type = .string_list,
            .description = "Paths exempt from rate limiting",
            .default_value = "[\"/health\", \"/ready\", \"/csrf-token\"]",
            .validation_rules = &[_]Field.ValidationRule{},
        },
    },
};

pub const auth_schema = Section{
    .name = "auth",
    .description = "Authentication configuration",
    .fields = &[_]Field{
        .{
            .name = "jwt_pem",
            .type = .optional_string,
            .description = "JWT PEM certificate content",
            .default_value = "null",
            .validation_rules = &[_]Field.ValidationRule{},
        },
        .{
            .name = "jwt_pem_path",
            .type = .optional_string,
            .description = "Path to JWT PEM certificate file",
            .default_value = "null",
            .validation_rules = &[_]Field.ValidationRule{},
        },
        .{
            .name = "jwt_secret",
            .type = .optional_string,
            .description = "JWT secret key",
            .default_value = "null",
            .validation_rules = &[_]Field.ValidationRule{},
        },
    },
};

/// Complete configuration schema
pub const config_schema = ConfigSchema{
    .sections = &[_]Section{
        server_schema,
        logging_schema,
        cors_schema,
        database_schema,
        uploads_schema,
        autoupdate_schema,
        ratelimit_schema,
        auth_schema,
    },
};
