# Icon Placeholder

To complete the extension setup, you need to create three PNG icon files:

1. `icon16.png` - 16x16 pixels
2. `icon48.png` - 48x48 pixels  
3. `icon128.png` - 128x128 pixels

## Quick Icon Creation Options

### Option 1: Online Icon Generator
- Visit https://www.favicon-generator.org/
- Upload or create an icon
- Download the required sizes

### Option 2: Image Editor
- Use any image editor (Photoshop, GIMP, Paint.NET, etc.)
- Create a simple icon (e.g., document with checkmark, text simplification symbol)
- Export/resize to the three required sizes

### Option 3: Simple SVG Converter
Create a simple SVG and convert to PNG:
```svg
<svg width="128" height="128" xmlns="http://www.w3.org/2000/svg">
  <rect width="128" height="128" fill="#667eea"/>
  <text x="64" y="80" font-size="80" fill="white" text-anchor="middle">📄</text>
</svg>
```

Then convert to PNG using an online SVG to PNG converter.

### Option 4: Temporary Placeholder
For testing, you can create simple colored squares as placeholders using any image editor.

## Icon Design Suggestions
- Document icon with simplification symbol
- Checkmark on document
- Text bubbles with simplified text
- Shield with document (for privacy/terms)

Place the generated PNG files in this `icons/` directory.


