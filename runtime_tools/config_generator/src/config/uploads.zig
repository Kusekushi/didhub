const std = @import("std");

/// Uploads configuration section
pub const UploadsConfig = struct {
    directory: []const u8,

    pub const default = UploadsConfig{
        .directory = "./uploads",
    };

    pub fn init(allocator: std.mem.Allocator) !UploadsConfig {
        return UploadsConfig{
            .directory = try allocator.dupe(u8, "./uploads"),
        };
    }

    pub fn deinit(self: *UploadsConfig, allocator: std.mem.Allocator) void {
        allocator.free(self.directory);
    }

    pub fn clone(self: UploadsConfig, allocator: std.mem.Allocator) !UploadsConfig {
        return UploadsConfig{
            .directory = try allocator.dupe(u8, self.directory),
        };
    }
};
