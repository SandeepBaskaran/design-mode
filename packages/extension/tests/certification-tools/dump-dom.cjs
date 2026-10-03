#!/usr/bin/env node
const {chromium}=require('playwright');
const path=require('node:path');
const args=process.argv.slice(2);
const profile=args.find(a=>a.startsWith('--user-data-dir='))?.split('=').slice(1).join('=');
const url=args.find(a=>/^(file:|data:)/.test(a));
if(!profile||!url||!process.env.CHROME_BINARY)throw Error('Local fixture URL, disposable profile and CHROME_BINARY required');
let browser;
(async()=>{
 browser=await chromium.launchPersistentContext(path.resolve(profile),{executablePath:process.env.CHROME_BINARY,headless:true,args:['--disable-background-networking','--proxy-server=http://127.0.0.1:9']});
 await browser.route('**/*',route=>/^(file:|data:)/.test(route.request().url())?route.continue():route.abort());
 const page=await browser.newPage();
 await page.goto(url);
 await page.waitForFunction(()=>{const e=document.querySelector('#result');return e&&e.textContent!=='RUNNING'},null,{timeout:15000});
 process.stdout.write(await page.content());
})().catch(error=>{console.error(error);process.exitCode=1}).finally(async()=>{if(browser)await browser.close()});
