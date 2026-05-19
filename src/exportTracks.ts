import type { GpxTrack, TrackBounds, TrackPoint } from './types';

type ExportOptions = {
  width?: number;
  height?: number;
  padding?: number;
  background?: string;
  filename?: string;
  colorForTrack?: (track: GpxTrack) => string;
  opacityForTrack?: (track: GpxTrack) => number;
};

type ProjectedPoint = {
  x: number;
  y: number;
};

export function exportTracksPng(tracks: GpxTrack[], options: ExportOptions = {}): void {
  const visibleTracks = tracks.filter((track) => track.visible);

  if (visibleTracks.length === 0) {
    return;
  }

  const width = options.width ?? 1600;
  const height = options.height ?? 1000;
  const padding = options.padding ?? 48;
  const background = options.background ?? '#ffffff';
  const colorForTrack = options.colorForTrack ?? ((track: GpxTrack) => track.color);
  const opacityForTrack = options.opacityForTrack ?? (() => 0.9);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }

  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  const bounds = mergeBounds(visibleTracks.map((track) => track.bounds));
  const projectedBounds = {
    topLeft: project({ lat: bounds.maxLat, lon: bounds.minLon }),
    bottomRight: project({ lat: bounds.minLat, lon: bounds.maxLon }),
  };

  const mapWidth = Math.max(projectedBounds.bottomRight.x - projectedBounds.topLeft.x, 0.0000001);
  const mapHeight = Math.max(projectedBounds.bottomRight.y - projectedBounds.topLeft.y, 0.0000001);
  const drawWidth = width - padding * 2;
  const drawHeight = height - padding * 2;
  const scale = Math.min(drawWidth / mapWidth, drawHeight / mapHeight);
  const offsetX = (width - mapWidth * scale) / 2;
  const offsetY = (height - mapHeight * scale) / 2;

  context.lineCap = 'round';
  context.lineJoin = 'round';

  visibleTracks.forEach((track) => {
    context.strokeStyle = colorForTrack(track);
    context.globalAlpha = opacityForTrack(track);
    context.lineWidth = 4;

    track.segments.forEach((segment) => {
      if (segment.length < 2) {
        return;
      }

      context.beginPath();
      segment.forEach((point, pointIndex) => {
        const projected = project(point);
        const x = offsetX + (projected.x - projectedBounds.topLeft.x) * scale;
        const y = offsetY + (projected.y - projectedBounds.topLeft.y) * scale;

        if (pointIndex === 0) {
          context.moveTo(x, y);
        } else {
          context.lineTo(x, y);
        }
      });
      context.stroke();
    });
  });

  context.globalAlpha = 1;

  const link = document.createElement('a');
  link.download = options.filename ?? 'gpx-tracks.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
}

function mergeBounds(boundsList: TrackBounds[]): TrackBounds {
  return boundsList.reduce<TrackBounds>(
    (merged, bounds) => ({
      minLat: Math.min(merged.minLat, bounds.minLat),
      maxLat: Math.max(merged.maxLat, bounds.maxLat),
      minLon: Math.min(merged.minLon, bounds.minLon),
      maxLon: Math.max(merged.maxLon, bounds.maxLon),
    }),
    {
      minLat: Number.POSITIVE_INFINITY,
      maxLat: Number.NEGATIVE_INFINITY,
      minLon: Number.POSITIVE_INFINITY,
      maxLon: Number.NEGATIVE_INFINITY,
    },
  );
}

function project(point: TrackPoint): ProjectedPoint {
  const sinLat = Math.sin((Math.max(Math.min(point.lat, 85.05112878), -85.05112878) * Math.PI) / 180);

  return {
    x: (point.lon + 180) / 360,
    y: 0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI),
  };
}
