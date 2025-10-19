const std = @import("std");

/// Logging configuration section
pub const LoggingConfig = struct {
    level: []const u8,
    json: bool,

    pub const default = LoggingConfig{
        .level = "info",
        .json = false,
    };

    pub fn init(allocator: std.mem.Allocator) !LoggingConfig {
        _ = allocator; // Not used for now
        return default;
    }

    pub fn deinit(self: *LoggingConfig) void {
        _ = self; // No dynamic allocation yet
    }

    pub fn clone(self: LoggingConfig, allocator: std.mem.Allocator) !LoggingConfig {
        return LoggingConfig{
            .level = try allocator.dupe(u8, self.level),
            .json = self.json,
        };
    }
};
