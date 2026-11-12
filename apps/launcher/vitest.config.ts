import preact from '@preact/preset-vite';
import { defineConfig, mergeConfig } from 'vitest/config';

import shared from '../../vitest.shared.js';

export default mergeConfig(shared, defineConfig({ plugins: [preact()] }));
