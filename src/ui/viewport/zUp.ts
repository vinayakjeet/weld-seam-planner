import { Object3D } from 'three'

// Must run before any camera or controls are constructed so they all see +Z as up.
Object3D.DEFAULT_UP.set(0, 0, 1)
