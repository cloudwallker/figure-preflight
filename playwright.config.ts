import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'tests',testMatch:'**/input*.browser.spec.ts',workers:1,timeout:30000,
 reporter:'list',outputDir:process.env.FIGURE_TEST_OUTPUT??'test-results',
 use:{baseURL:'http://127.0.0.1:48606',headless:true,launchOptions:{timeout:20000}},
 webServer:{command:'node tests/browser/serve-input.mjs',url:'http://127.0.0.1:48606',reuseExistingServer:false},
 projects:[{name:'chromium',use:{browserName:'chromium'}},{name:'firefox',use:{browserName:'firefox'}}]});
