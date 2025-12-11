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
        return LoggingConfig{
            .level = try allocator.dupe(u8, "info"),
            .json = false,
        };
    }

    pub fn deinit(self: *LoggingConfig, allocator: std.mem.Allocator) void {
        allocator.free(self.level);
    }

    pub fn clone(self: LoggingConfig, allocator: std.mem.Allocator) !LoggingConfig {
        return LoggingConfig{
            .level = try allocator.dupe(u8, self.level),
            .json = self.json,
        };
    }
};
