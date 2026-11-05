import { createContext, useContext } from 'react'
import type { Vec3 } from '../../core/math/vec3'

// The point the world group of the scene sits at (see displayOrigin); everything inside it is drawn relative to it.
export const OriginContext = createContext<Vec3>([0, 0, 0])

export const useOrigin = (): Vec3 => useContext(OriginContext)
