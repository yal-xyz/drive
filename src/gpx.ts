import type { FileLoadIssue, GpxTrack, TrackBounds, TrackPoint } from './types';

const TRACK_COLORS = [
  '#1d78c1',
  '#d14f2f',
  '#228b63',
  '#8a5dbb',
  '#c18b18',
  '#d2387c',
  '#2b8c9f',
  '#5f6f1d',
];

export type ParsedGpxFile = {
  tracks: GpxTrack[];
  issues: FileLoadIssue[];
};

export async function parseGpxFiles(files: File[]): Promise<ParsedGpxFile> {
  const parsed = await Promise.all(files.map((file, fileIndex) => parseGpxFile(file, fileIndex)));

  return parsed.reduce<ParsedGpxFile>(
    (result, item) => {
      result.tracks.push(...item.tracks);
      result.issues.push(...item.issues);
      return result;
    },
    { tracks: [], issues: [] },
  );
}

async function parseGpxFile(file: File, fileIndex: number): Promise<ParsedGpxFile> {
  const text = await file.text();
  const document = new DOMParser().parseFromString(text, 'application/xml');
  const parserError = document.querySelector('parsererror');

  if (parserError) {
    return {
      tracks: [],
      issues: [{ fileName: file.name, message: 'Could not parse XML.' }],
    };
  }

  const trackNodes = byLocalName(document, 'trk');

  if (trackNodes.length === 0) {
    return {
      tracks: [],
      issues: [{ fileName: file.name, message: 'No GPX tracks found.' }],
    };
  }

  const tracks: GpxTrack[] = [];
  const issues: FileLoadIssue[] = [];

  trackNodes.forEach((trackNode, trackIndex) => {
    const segments = byLocalName(trackNode, 'trkseg')
      .map((segmentNode) =>
        byLocalName(segmentNode, 'trkpt')
          .map(pointFromNode)
          .filter((point): point is TrackPoint => point !== null),
      )
      .filter((segment) => segment.length > 0);

    const pointCount = segments.reduce((count, segment) => count + segment.length, 0);

    if (pointCount === 0) {
      issues.push({
        fileName: file.name,
        message: `Track ${trackIndex + 1} does not contain valid track points.`,
      });
      return;
    }

    const name = firstChildText(trackNode, 'name') || fallbackTrackName(file.name, trackIndex);
    const color = TRACK_COLORS[(fileIndex + tracks.length) % TRACK_COLORS.length];

    tracks.push({
      id: `${file.name}-${fileIndex}-${trackIndex}-${pointCount}`,
      fileName: file.name,
      name,
      color,
      visible: true,
      pointCount,
      bounds: boundsForSegments(segments),
      segments,
    });
  });

  return { tracks, issues };
}

function byLocalName(root: ParentNode, localName: string): Element[] {
  if ('getElementsByTagNameNS' in root && typeof root.getElementsByTagNameNS === 'function') {
    return Array.from(root.getElementsByTagNameNS('*', localName));
  }

  return Array.from((root as Element | Document).getElementsByTagName(localName));
}

function firstChildText(root: Element, localName: string): string {
  const child = Array.from(root.children).find((element) => element.localName === localName);
  return child?.textContent?.trim() ?? '';
}

function pointFromNode(node: Element): TrackPoint | null {
  const lat = Number(node.getAttribute('lat'));
  const lon = Number(node.getAttribute('lon'));

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return null;
  }

  return { lat, lon };
}

function boundsForSegments(segments: TrackPoint[][]): TrackBounds {
  const initial = {
    minLat: Number.POSITIVE_INFINITY,
    maxLat: Number.NEGATIVE_INFINITY,
    minLon: Number.POSITIVE_INFINITY,
    maxLon: Number.NEGATIVE_INFINITY,
  };

  return segments.reduce<TrackBounds>((bounds, segment) => {
    segment.forEach((point) => {
      bounds.minLat = Math.min(bounds.minLat, point.lat);
      bounds.maxLat = Math.max(bounds.maxLat, point.lat);
      bounds.minLon = Math.min(bounds.minLon, point.lon);
      bounds.maxLon = Math.max(bounds.maxLon, point.lon);
    });

    return bounds;
  }, initial);
}

function fallbackTrackName(fileName: string, trackIndex: number): string {
  const baseName = fileName.replace(/\.gpx$/i, '');
  return trackIndex === 0 ? baseName : `${baseName} ${trackIndex + 1}`;
}
