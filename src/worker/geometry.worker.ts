import { expose } from 'comlink'
import { createGeometryApi } from './geometry.api'
import { SHARED_WORKER_NAME } from './sharedMemory'

// The page names the worker for what its WebGL accepted (sharedMemory.ts); without that name the worker keeps its own copy.
expose(createGeometryApi(self.name === SHARED_WORKER_NAME ? {} : { shareBuffers: false }))
