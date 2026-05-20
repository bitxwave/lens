// import adapter from '@sveltejs/adapter-auto';
import adapter from '@sveltejs/adapter-static';
import preprocess from 'svelte-preprocess';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  // Consult https://github.com/sveltejs/svelte-preprocess
  // for more information about preprocessors
  preprocess: preprocess(),
  extensions: ['.svelte'],
  kit: {
    adapter: adapter({
      fallback: 'index.html'
    }),
  },
  endpointExtensions: ['.js', '.ts'],
};

export default config;
