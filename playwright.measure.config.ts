import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'tests',testMatch:['measure.browser.spec.ts','font.browser.spec.ts','text-location.browser.spec.ts','responsiveness.browser.spec.ts'],workers:1,timeout:60000,
 reporter:'list',outputDir:process.env.FIGURE_TEST_OUTPUT??'test-results',
 use:{baseURL:'http://127.0.0.1:48616',headless:true,viewport:{width:1200,height:900}},
 webServer:{command:'node tests/browser/serve-measure.mjs',url:'http://127.0.0.1:48616',reuseExistingServer:false},
 projects:[{name:'chromium',use:{browserName:'chromium'}},{name:'firefox',use:{browserName:'firefox'}}]});
