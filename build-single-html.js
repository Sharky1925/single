const fs = require('fs');
const path = require('path');

// Paths relative to the single folder (go up one level to techflow)
const techflowPath = path.join(__dirname, '..');
const distPath = path.join(techflowPath, 'frontend', 'dist');
const assetsPath = path.join(distPath, 'assets');
const backendDataPath = path.join(techflowPath, 'backend', 'data');

console.log('Building single HTML file...\n');

// Read the main files - auto-detect file names
const assetFiles = fs.readdirSync(assetsPath);
const cssFile = assetFiles.find(f => f.startsWith('index-') && f.endsWith('.css'));
const mainJsFile = assetFiles.find(f => f.startsWith('index-') && f.endsWith('.js'));
const vendorJsFile = assetFiles.find(f => f.startsWith('vendor-') && f.endsWith('.js'));

if (!cssFile || !mainJsFile || !vendorJsFile) {
    console.error('Could not find required asset files in', assetsPath);
    process.exit(1);
}

console.log(`Found assets: ${cssFile}, ${mainJsFile}, ${vendorJsFile}`);

const css = fs.readFileSync(path.join(assetsPath, cssFile), 'utf8');
let mainJs = fs.readFileSync(path.join(assetsPath, mainJsFile), 'utf8');
const vendorJs = fs.readFileSync(path.join(assetsPath, vendorJsFile), 'utf8');

// Read vite.svg for favicon
const viteSvg = fs.readFileSync(path.join(distPath, 'vite.svg'), 'utf8');
const viteSvgBase64 = Buffer.from(viteSvg).toString('base64');

// Read backend data files
const servicesData = JSON.parse(fs.readFileSync(path.join(backendDataPath, 'services.json'), 'utf8'));
const portfolioData = JSON.parse(fs.readFileSync(path.join(backendDataPath, 'portfolio.json'), 'utf8'));
const industriesData = JSON.parse(fs.readFileSync(path.join(backendDataPath, 'industries.json'), 'utf8'));

console.log(`Loaded ${servicesData.length} services, ${portfolioData.length} portfolio items, ${industriesData.length} industries`);

// Convert images to base64
const imagesDir = path.join(assetsPath, 'services');
const imageFiles = fs.readdirSync(imagesDir).filter(f => f.endsWith('.png'));
const imageMap = {};

imageFiles.forEach(file => {
    const filePath = path.join(imagesDir, file);
    const imageData = fs.readFileSync(filePath);
    const base64 = imageData.toString('base64');
    imageMap[`/assets/services/${file}`] = `data:image/png;base64,${base64}`;
});
console.log(`Converted ${imageFiles.length} images to base64`);

// Process CSS to inline images
let processedCss = css;
Object.keys(imageMap).forEach(imgPath => {
    processedCss = processedCss.replace(new RegExp(imgPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), imageMap[imgPath]);
});

// Optimize CSS - remove duplicate rules (basic deduplication)
const cssLines = processedCss.split('\n');
const seenRules = new Set();
const optimizedCssLines = [];
let currentRule = '';
let braceCount = 0;

for (const line of cssLines) {
    currentRule += line + '\n';
    braceCount += (line.match(/\{/g) || []).length;
    braceCount -= (line.match(/\}/g) || []).length;

    if (braceCount === 0 && currentRule.trim()) {
        const ruleKey = currentRule.trim();
        if (!seenRules.has(ruleKey)) {
            seenRules.add(ruleKey);
            optimizedCssLines.push(currentRule);
        }
        currentRule = '';
    }
}
processedCss = optimizedCssLines.join('');

// Process JavaScript to inline image references
Object.keys(imageMap).forEach(imgPath => {
    const escapedPath = imgPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    mainJs = mainJs.replace(new RegExp(escapedPath, 'g'), imageMap[imgPath]);
});

// IMPORTANT: Replace vendor import BEFORE escaping
// Find and replace all variations of the import (dynamic filename)
const vendorImportRegex = new RegExp(`from\\s*["']\\.\\/${vendorJsFile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'g');
mainJs = mainJs.replace(vendorImportRegex, 'from "__VENDOR_URL__"');

// Escape special characters for embedding in template literal
function escapeForTemplateLiteral(str) {
    return str
        .replace(/\\/g, '\\\\')
        .replace(/`/g, '\\`')
        .replace(/\$\{/g, '\\${');
}

const escapedVendorJs = escapeForTemplateLiteral(vendorJs);
const escapedMainJs = escapeForTemplateLiteral(mainJs);

// Stringify data properly for embedding
const servicesJson = JSON.stringify(servicesData);
const portfolioJson = JSON.stringify(portfolioData);
const industriesJson = JSON.stringify(industriesData);

// Build the single HTML file
const singleHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" href="data:image/svg+xml;base64,${viteSvgBase64}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="TechFlow - Professional IT services including cloud solutions, cybersecurity, IT consulting, and software development. Transform your business with innovative technology solutions." />
    <meta name="keywords" content="IT services, cloud solutions, cybersecurity, IT consulting, software development, managed IT services" />
    <meta name="theme-color" content="#3b82f6" />
    <title>TechFlow - IT Services & Technology Solutions</title>
    <style>
${processedCss}
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script>
      // Embedded static data
      window.__STATIC_DATA__ = {
        services: ${servicesJson},
        portfolio: ${portfolioJson},
        industries: ${industriesJson}
      };

      // Mock fetch for API calls
      const originalFetch = window.fetch;
      window.fetch = function(url, options) {
        const urlStr = url.toString();

        // Handle API endpoints with static data
        if (urlStr.includes('/api/services')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(window.__STATIC_DATA__.services)
          });
        }

        if (urlStr.includes('/api/portfolio')) {
          let data = [...window.__STATIC_DATA__.portfolio];
          // Handle category filter
          const categoryMatch = urlStr.match(/category=([^&]+)/);
          if (categoryMatch && categoryMatch[1]) {
            const category = decodeURIComponent(categoryMatch[1]);
            data = data.filter(item => item.category === category);
          }
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(data)
          });
        }

        if (urlStr.includes('/api/industries')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(window.__STATIC_DATA__.industries)
          });
        }

        // For auth endpoints, return mock responses
        if (urlStr.includes('/api/auth/verify')) {
          return Promise.resolve({
            ok: false,
            status: 401,
            json: () => Promise.resolve({ message: 'Static site - auth not available' })
          });
        }

        if (urlStr.includes('/api/auth/login') || urlStr.includes('/api/auth/register')) {
          return Promise.resolve({
            ok: false,
            status: 503,
            json: () => Promise.resolve({ message: 'Authentication not available in static mode' })
          });
        }

        // For contact form, show a friendly message
        if (urlStr.includes('/api/contact')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ message: 'Thank you for your interest! Please contact us directly at info@techflow.com' })
          });
        }

        // For tickets endpoint
        if (urlStr.includes('/api/tickets')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve([])
          });
        }

        // Fall back to original fetch for other requests (images, etc.)
        return originalFetch.apply(this, arguments);
      };
    </script>
    <script>
      (function() {
        // Create vendor blob URL
        const vendorCode = \`${escapedVendorJs}\`;
        const vendorBlob = new Blob([vendorCode], { type: 'text/javascript' });
        const vendorUrl = URL.createObjectURL(vendorBlob);

        // Create main code with vendor URL replaced
        const mainCode = \`${escapedMainJs}\`.replace(/__VENDOR_URL__/g, vendorUrl);

        const mainBlob = new Blob([mainCode], { type: 'text/javascript' });
        const mainUrl = URL.createObjectURL(mainBlob);

        // Load the main module
        const script = document.createElement('script');
        script.type = 'module';
        script.src = mainUrl;
        document.head.appendChild(script);
      })();
    </script>
  </body>
</html>`;

// Write the single HTML file
const outputPath = path.join(__dirname, 'techflow-single.html');
fs.writeFileSync(outputPath, singleHtml);

const fileSizeMB = (Buffer.byteLength(singleHtml) / 1024 / 1024).toFixed(2);
console.log('\n✓ Single HTML file created successfully!');
console.log('Output: ' + outputPath);
console.log('Size: ' + fileSizeMB + ' MB');
console.log('');
console.log('Features:');
console.log('- All CSS and JavaScript inlined');
console.log('- All images embedded as base64');
console.log('- Static data for services, portfolio, industries');
console.log('- API calls mocked for offline use');
console.log('');
console.log('Limitations:');
console.log('- Login/Auth features disabled');
console.log('- Contact form simulated');
console.log('');
console.log('Optimization tip: Enable gzip on your server for ~70% size reduction');
