use serde::Deserialize;
use serde::Serialize;

const MIN_VISIBLE_WIDTH: i64 = 100;
const MIN_VISIBLE_HEIGHT: i64 = 50;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct WindowBounds {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

impl WindowBounds {
    pub fn new(x: i32, y: i32, width: u32, height: u32) -> Self {
        Self {
            x,
            y,
            width,
            height,
        }
    }

    pub fn overlap(&self, other: &WindowBounds) -> (i64, i64) {
        let left = i64::from(self.x).max(i64::from(other.x));
        let top = i64::from(self.y).max(i64::from(other.y));
        let right = (i64::from(self.x) + i64::from(self.width))
            .min(i64::from(other.x) + i64::from(other.width));
        let bottom = (i64::from(self.y) + i64::from(self.height))
            .min(i64::from(other.y) + i64::from(other.height));
        ((right - left).max(0), (bottom - top).max(0))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct WindowSettings {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    #[serde(default)]
    pub maximized: bool,
}

impl WindowSettings {
    pub fn new(bounds: WindowBounds, maximized: bool) -> Self {
        Self {
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
            maximized,
        }
    }

    pub fn bounds(&self) -> WindowBounds {
        WindowBounds::new(self.x, self.y, self.width, self.height)
    }

    pub fn is_reachable(&self, monitors: &[WindowBounds]) -> bool {
        if self.width == 0 || self.height == 0 {
            return false;
        }
        let bounds = self.bounds();
        monitors.iter().any(|monitor| {
            let (width, height) = bounds.overlap(monitor);
            width >= MIN_VISIBLE_WIDTH && height >= MIN_VISIBLE_HEIGHT
        })
    }
}
