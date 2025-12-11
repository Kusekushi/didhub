const std = @import("std");

/// Auto-update configuration section
pub const AutoUpdateConfig = struct {
    enabled: bool,
    check_enabled: bool,
    repo: ?[]const u8,
    check_interval_hours: u32,

    pub const default = AutoUpdateConfig{
        .enabled = false,
        .check_enabled = false,
        .repo = null,
        .check_interval_hours = 24,
    };

    pub fn init(allocator: std.mem.Allocator) !AutoUpdateConfig {
        _ = allocator; // Not used for now
        return default;
    }

    pub fn deinit(self: *AutoUpdateConfig, allocator: std.mem.Allocator) void {
        if (self.repo) |repo| allocator.free(repo);
    }

    pub fn clone(self: AutoUpdateConfig, allocator: std.mem.Allocator) !AutoUpdateConfig {
        return AutoUpdateConfig{
            .enabled = self.enabled,
            .check_enabled = self.check_enabled,
            .repo = if (self.repo) |value| try allocator.dupe(u8, value) else null,
            .check_interval_hours = self.check_interval_hours,
        };
    }
};
