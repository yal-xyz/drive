<script setup lang="ts">
import L, { type LatLngExpression, type Polyline } from 'leaflet';
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { exportTracksPng } from './exportTracks';
import { parseGpxFiles } from './gpx';
import type { FileLoadIssue, GpxTrack } from './types';

const mapElement = ref<HTMLDivElement | null>(null);
const folderInput = ref<HTMLInputElement | null>(null);
const tracks = ref<GpxTrack[]>([]);
const issues = ref<FileLoadIssue[]>([]);
const status = ref('Choose a folder of GPX files to begin.');
const isLoading = ref(false);
const sourceFolderName = ref('folder');
const colorMode = ref<'track' | 'single'>('track');
const singleTrackColor = ref('#1f6f55');
const trackOpacity = ref(0.32);

let map: L.Map | null = null;
const trackLayers = new Map<string, Polyline>();

const visibleTracks = computed(() => tracks.value.filter((track) => track.visible));
const totalPoints = computed(() => tracks.value.reduce((total, track) => total + track.pointCount, 0));
const canExport = computed(() => visibleTracks.value.length > 0);
const opacityPercent = computed(() => Math.round(trackOpacity.value * 100));

onMounted(() => {
  if (!mapElement.value) {
    return;
  }

  map = L.map(mapElement.value, {
    zoomControl: false,
  }).setView([23.8, 121], 7);

  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  }).addTo(map);
});

const renderSignature = computed(() =>
  tracks.value.map((track) => `${track.id}:${track.visible ? 1 : 0}`).join('|'),
);

watch([renderSignature, colorMode, singleTrackColor, trackOpacity], () => {
  renderTracks();
});

async function chooseFolder(): Promise<void> {
  if ('showDirectoryPicker' in window && typeof window.showDirectoryPicker === 'function') {
    try {
      const handle = await window.showDirectoryPicker();
      const files: File[] = [];

      for await (const entry of handle.values()) {
        if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.gpx')) {
          const file = await (entry as FileSystemFileHandle).getFile();
          files.push(file);
        }
      }

      await loadFiles(files, handle.name);
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        status.value = 'Folder selection canceled.';
        return;
      }

      status.value = 'Folder picker was not available. Use the fallback file selector.';
    }
  }

  folderInput.value?.click();
}

async function handleFileInput(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  await loadFiles(files, folderNameFromFiles(files));
  input.value = '';
}

async function loadFiles(selectedFiles: File[], folderName = 'folder'): Promise<void> {
  sourceFolderName.value = sanitizeFilenamePart(folderName);
  const gpxFiles = selectedFiles
    .filter((file) => file.name.toLowerCase().endsWith('.gpx'))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (gpxFiles.length === 0) {
    tracks.value = [];
    issues.value = [{ fileName: 'Folder', message: 'No .gpx files found.' }];
    status.value = 'No GPX files were found in the selected folder.';
    return;
  }

  isLoading.value = true;
  status.value = `Loading ${gpxFiles.length} GPX file${gpxFiles.length === 1 ? '' : 's'}...`;

  try {
    const parsed = await parseGpxFiles(gpxFiles);
    tracks.value = parsed.tracks;
    issues.value = parsed.issues;
    status.value = parsed.tracks.length
      ? `Loaded ${parsed.tracks.length} track${parsed.tracks.length === 1 ? '' : 's'} from ${gpxFiles.length} file${gpxFiles.length === 1 ? '' : 's'}.`
      : 'No valid tracks were found.';

    await nextTick();
    fitVisibleTracks();
  } catch (error) {
    tracks.value = [];
    issues.value = [{ fileName: 'Loader', message: error instanceof Error ? error.message : 'Unexpected load failure.' }];
    status.value = 'Unable to load GPX files.';
  } finally {
    isLoading.value = false;
  }
}

function renderTracks(): void {
  if (!map) {
    return;
  }

  const activeMap = map;

  for (const layer of trackLayers.values()) {
    layer.removeFrom(activeMap);
  }
  trackLayers.clear();

  tracks.value.forEach((track) => {
    if (!track.visible) {
      return;
    }

    const latLngs: LatLngExpression[][] = track.segments.map((segment) => segment.map((point) => [point.lat, point.lon]));
    const layer = L.polyline(latLngs, {
      color: colorForTrack(track),
      weight: 4,
      opacity: opacityForTrack(),
    }).bindTooltip(`${track.name} (${track.pointCount.toLocaleString()} pts)`);

    layer.addTo(activeMap);
    trackLayers.set(track.id, layer);
  });
}

function fitVisibleTracks(): void {
  if (!map || visibleTracks.value.length === 0) {
    return;
  }

  const bounds = L.latLngBounds([]);
  visibleTracks.value.forEach((track) => {
    track.segments.forEach((segment) => {
      segment.forEach((point) => bounds.extend([point.lat, point.lon]));
    });
  });

  if (bounds.isValid()) {
    map.fitBounds(bounds, { padding: [36, 36], maxZoom: 15 });
  }
}

function toggleTrack(track: GpxTrack): void {
  track.visible = !track.visible;
}

function clearTracks(): void {
  tracks.value = [];
  issues.value = [];
  sourceFolderName.value = 'folder';
  status.value = 'Choose a folder of GPX files to begin.';
}

function exportPng(): void {
  if (!canExport.value) {
    status.value = 'No visible tracks to export.';
    return;
  }

  exportTracksPng(tracks.value, {
    filename: exportFilename(),
    colorForTrack,
    opacityForTrack,
  });
  status.value = 'Exported visible tracks to PNG.';
}

function colorForTrack(track: GpxTrack): string {
  return colorMode.value === 'single' ? singleTrackColor.value : track.color;
}

function opacityForTrack(): number {
  return trackOpacity.value;
}

function exportFilename(): string {
  return `drive_${sourceFolderName.value}_${Date.now()}.png`;
}

function folderNameFromFiles(files: File[]): string {
  const firstFile = files[0] as (File & { webkitRelativePath?: string }) | undefined;
  const folderName = firstFile?.webkitRelativePath?.split('/').filter(Boolean)[0];
  return folderName || 'folder';
}

function sanitizeFilenamePart(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'folder';
}
</script>

<template>
  <main class="app-shell">
    <aside class="sidebar" aria-label="GPX controls">
      <section class="brand-panel">
        <p class="eyebrow">GPX Track Map</p>
        <h1>Local tracks, clean exports.</h1>
      </section>

      <section class="toolbar" aria-label="Map actions">
        <button class="primary-button" type="button" :disabled="isLoading" @click="chooseFolder">Choose Folder</button>
        <button type="button" :disabled="visibleTracks.length === 0" @click="fitVisibleTracks">Fit Tracks</button>
        <button type="button" :disabled="!canExport" @click="exportPng">Export PNG</button>
        <button type="button" :disabled="tracks.length === 0 && issues.length === 0" @click="clearTracks">Clear</button>
      </section>

      <input
        ref="folderInput"
        class="hidden-input"
        type="file"
        accept=".gpx,application/gpx+xml"
        webkitdirectory
        multiple
        @change="handleFileInput"
      />

      <section class="status-panel" aria-live="polite">
        <p>{{ status }}</p>
        <dl v-if="tracks.length" class="stats-grid">
          <div>
            <dt>Tracks</dt>
            <dd>{{ tracks.length }}</dd>
          </div>
          <div>
            <dt>Points</dt>
            <dd>{{ totalPoints.toLocaleString() }}</dd>
          </div>
          <div>
            <dt>Visible</dt>
            <dd>{{ visibleTracks.length }}</dd>
          </div>
        </dl>
      </section>

      <section class="display-panel" aria-label="Track display settings">
        <div class="control-heading">
          <h2>Display</h2>
          <span>{{ opacityPercent }}% opacity</span>
        </div>

        <div class="segmented-control" role="group" aria-label="Track color mode">
          <button type="button" :class="{ active: colorMode === 'track' }" @click="colorMode = 'track'">Per Track</button>
          <button type="button" :class="{ active: colorMode === 'single' }" @click="colorMode = 'single'">Single</button>
        </div>

        <label class="color-control">
          <span>Track color</span>
          <input v-model="singleTrackColor" type="color" :disabled="colorMode !== 'single'" />
        </label>

        <label class="range-control">
          <span>Overlap intensity</span>
          <input v-model.number="trackOpacity" type="range" min="0.05" max="1" step="0.05" />
        </label>
      </section>

      <section class="track-list" aria-label="Loaded tracks">
        <div v-if="tracks.length === 0" class="empty-state">
          Pick a folder that contains GPX files. Valid tracks will appear here and on the map.
        </div>

        <button
          v-for="track in tracks"
          :key="track.id"
          class="track-row"
          :class="{ muted: !track.visible }"
          type="button"
          @click="toggleTrack(track)"
        >
          <span class="swatch" :style="{ backgroundColor: colorForTrack(track), opacity: opacityForTrack() }" aria-hidden="true"></span>
          <span class="track-copy">
            <strong>{{ track.name }}</strong>
            <span>{{ track.fileName }} · {{ track.pointCount.toLocaleString() }} pts</span>
          </span>
          <span class="visibility">{{ track.visible ? 'On' : 'Off' }}</span>
        </button>
      </section>

      <section v-if="issues.length" class="issue-list" aria-label="File issues">
        <h2>File Issues</h2>
        <p v-for="issue in issues" :key="`${issue.fileName}-${issue.message}`">
          <strong>{{ issue.fileName }}</strong>: {{ issue.message }}
        </p>
      </section>
    </aside>

    <section class="map-stage" aria-label="Interactive map">
      <div ref="mapElement" class="map"></div>
    </section>
  </main>
</template>
