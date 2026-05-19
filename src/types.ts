export type TrackPoint = {
  lat: number;
  lon: number;
};

export type TrackBounds = {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
};

export type GpxTrack = {
  id: string;
  fileName: string;
  name: string;
  color: string;
  visible: boolean;
  pointCount: number;
  bounds: TrackBounds;
  segments: TrackPoint[][];
};

export type FileLoadIssue = {
  fileName: string;
  message: string;
};
