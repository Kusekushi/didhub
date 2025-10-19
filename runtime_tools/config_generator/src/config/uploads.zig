const std = @import("std");

/// Uploads configuration section
pub const UploadsConfig = struct {
    directory: []const u8,

    pub const default = UploadsConfig{
        .directory = "./uploads",
    };

    pub fn init(allocator: std.mem.Allocator) !UploadsConfig {
        _ = allocator; // Not used for now
        return default;
    }

    pub fn deinit(self: *UploadsConfig) void {
        _ = self; // No dynamic allocation yet
    }

    pub fn clone(self: UploadsConfig, allocator: std.mem.Allocator) !UploadsConfig {
        return UploadsConfig{
            .directory = try allocator.dupe(u8, self.directory),
        };
    }
};
