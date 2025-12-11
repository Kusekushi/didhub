const std = @import("std");

/// Rate limiting configuration section
pub const RateLimitConfig = struct {
    enabled: bool,
    per_ip: bool,
    per_user: bool,
    rate_per_sec: u32,
    burst: u32,
    exempt_paths: std.ArrayList([]const u8),

    pub const default = RateLimitConfig{
        .enabled = false,
        .per_ip = true,
        .per_user = true,
        .rate_per_sec = 100,
        .burst = 200,
        .exempt_paths = undefined, // Must be initialized with allocator
    };

    pub fn init(allocator: std.mem.Allocator) !RateLimitConfig {
        var exempt_paths = std.ArrayList([]const u8).initCapacity(allocator, 3) catch return error.OutOfMemory;
        try exempt_paths.append(allocator, try allocator.dupe(u8, "/health"));
        try exempt_paths.append(allocator, try allocator.dupe(u8, "/ready"));
        try exempt_paths.append(allocator, try allocator.dupe(u8, "/csrf-token"));

        return RateLimitConfig{
            .enabled = false,
            .per_ip = true,
            .per_user = true,
            .rate_per_sec = 100,
            .burst = 200,
            .exempt_paths = exempt_paths,
        };
    }

    pub fn deinit(self: *RateLimitConfig, allocator: std.mem.Allocator) void {
        for (self.exempt_paths.items) |path| {
            allocator.free(path);
        }
        self.exempt_paths.deinit(allocator);
    }

    pub fn clone(self: RateLimitConfig, allocator: std.mem.Allocator) !RateLimitConfig {
        var exempt_paths = std.ArrayList([]const u8).initCapacity(allocator, self.exempt_paths.items.len) catch return error.OutOfMemory;
        for (self.exempt_paths.items) |path| {
            const cloned = try allocator.dupe(u8, path);
            exempt_paths.appendAssumeCapacity(cloned);
        }

        return RateLimitConfig{
            .enabled = self.enabled,
            .per_ip = self.per_ip,
            .per_user = self.per_user,
            .rate_per_sec = self.rate_per_sec,
            .burst = self.burst,
            .exempt_paths = exempt_paths,
        };
    }
};
