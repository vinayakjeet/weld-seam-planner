import { expose } from 'comlink'
import { createGeometryApi } from './geometry.api'

expose(createGeometryApi())
