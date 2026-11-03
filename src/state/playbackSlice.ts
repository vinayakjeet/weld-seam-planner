import type { StateCreator } from 'zustand'
import type { Plan } from '../core/job/plan'
import type { PlanTiming } from '../core/job/timing'
import { playbackTotalS, type PlaybackPath } from '../core/sequence/playback'
import type { AppState } from './store'

export const SPEEDS = [1, 5, 20] as const
export type PlaybackSpeed = (typeof SPEEDS)[number]

export interface PlaybackData {
  path: PlaybackPath
  timing: PlanTiming
}

// Playback of the plan: where in time the torch is, whether the clock runs, and how fast. None of it is undo history.
export interface PlaybackSlice {
  playing: boolean
  timeS: number
  speed: PlaybackSpeed
  // The path and timing the playback runs on, and the plan they were worked out for.
  playback: PlaybackData | null
  playbackFor: Plan | null
  setPlayback: (plan: Plan, data: PlaybackData) => void
  play: () => void
  pause: () => void
  // Pause when playing; otherwise play, from 0 when the end has been reached.
  toggle: () => void
  seek: (timeS: number) => void
  setSpeed: (speed: PlaybackSpeed) => void
  // Moves the clock on by dtS real seconds at the chosen speed, and stops at the end.
  tick: (dtS: number) => void
}

export const totalOf = (state: Pick<AppState, 'playback'>): number => (state.playback ? playbackTotalS(state.playback.timing) : 0)

export const createPlaybackSlice: StateCreator<AppState, [], [], PlaybackSlice> = (set, get) => ({
  playing: false,
  timeS: 0,
  speed: 1,
  playback: null,
  playbackFor: null,

  setPlayback: (playbackFor, playback) =>
    set((state) => {
      const total = playbackTotalS(playback.timing)
      // A shorter plan can leave the clock past its end.
      return { playback, playbackFor, timeS: Math.min(state.timeS, total), playing: total > 0 && state.playing }
    }),

  play: () => {
    if (totalOf(get()) > 0) set({ playing: true })
  },

  pause: () => set((state) => (state.playing ? { playing: false } : state)),

  toggle: () => {
    const state = get()
    const total = totalOf(state)
    if (state.playing) set({ playing: false })
    else if (total > 0) set({ playing: true, timeS: state.timeS >= total ? 0 : state.timeS })
  },

  seek: (timeS) => {
    if (!Number.isFinite(timeS)) return
    set({ timeS: Math.min(Math.max(timeS, 0), totalOf(get())) })
  },

  setSpeed: (speed) => set({ speed }),

  tick: (dtS) => {
    const state = get()
    if (!state.playing || !(dtS > 0)) return
    const total = totalOf(state)
    const next = state.timeS + dtS * state.speed
    if (next >= total) set({ timeS: total, playing: false })
    else set({ timeS: next })
  },
})
