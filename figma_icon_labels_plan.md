# Replace Text Labels with Icons in Design Panel (Figma Style)

Based on your feedback, we will permanently replace text labels with Lucide icons (no toggle switch) to create a clean, intuitive, and less overwhelming UI exactly like Figma. We will also keep the letters `X`, `Y`, `Z`, `W` (Width), and `H` (Height) as text, as this is standard in design tools.

## Proposed Implementation

1. **Remove Toggle/State:** I will not add any `propertyLabels` settings toggle. The UI will permanently be icon-first.
2. **Update Builders:** I will modify the input builders (`inp`, `sizeInput`, `gapInput`, `sel`, etc.) to accept an `iconName` (from our Lucide SVG library) or a `letter` (for X, Y, Z, W, H).
3. **Tooltip Integration:** The old text label (e.g., "Opacity") will be injected as a `title` attribute on the field label, creating a native tooltip on hover.
4. **CSS Updates:** I will ensure `.dm-field-label` visually centers the SVG icons and letters perfectly next to the input fields.

---

## Detailed Section-by-Section Icon Mapping

Please review this mapping. All proposed icons exist in our Lucide `icons.ts` bundle or will be added from the official Lucide set.

### 📍 Position
- **X** -> Letter `X`
- **Y** -> Letter `Y`
- **Z** -> Letter `Z`
- **Right / Bottom** -> `arrowRightToLine` / `arrowDownToLine`
- **Rotate** -> `rotateCwSquare`
- **Transform Origin** -> `crosshair`
- **Skew X / Y** -> `moveHorizontal` / `moveVertical`
- **Perspective** -> `move3d`
- **Anchor properties** -> `link2` or `magnet`
- **View Transition** -> `film`

### 📏 Layout
- **Width** -> Letter `W`
- **Height** -> Letter `H`
- **Min W / Min H** -> `shrink`
- **Max W / Max H** -> `maximize`
- **Aspect Ratio** -> `ratio`
- **Display** -> `layoutGrid` or `box`
- **Flex/Grid Direction** -> `arrowRight` / `arrowDown`
- **Alignment (Align/Justify)** -> (Existing alignment icons: `alignStartVertical`, `alignCenterHorizontal`, etc.)
- **Gap** -> `spacing`
- **Overflow** -> `scissors` (Hidden) / `square` (Visible)

### 🎨 Appearance (Styles & Radii)
- **Opacity** -> `circleHalfFull`
- **Blend Mode** -> `layers`
- **Visibility** -> `eye`
- **Corner Radius** -> `squareRoundCorner`
- **Outline** -> `squareDashed`

### 🔤 Typography
- **Font Family** -> `type` (T icon)
- **Weight** -> `bold`
- **Size** -> `moveVertical` (or `type`)
- **Line Height** -> `rows3`
- **Letter Spacing** -> `moveHorizontal`
- **Color** -> `palette`
- **Text Align** -> (Existing alignment icons: `alignLeft`, `alignCenter`, etc.)
- **Text Transform** -> `caseUpper` / `caseLower`
- **Text Decoration** -> `underline` / `strikethrough`
- **Indent / Word Space** -> `list` / `space`

### 🖌 Fill / Stroke / Effects
- **Fill Color** -> `palette` / `paintBucket`
- **Stroke Color** -> `palette`
- **Stroke Width** -> `minus` or `ruler`
- **Stroke Style** -> `squareDashed`
- **Box Shadow** -> `squareStack`
- **Filter / Backdrop Filter** -> `sun` / `contrast`

### 🎬 Motion
- **Transition / Animation** -> `activity`
- **Duration / Delay** -> `clock`
- **Easing** -> `wand`

---

## User Review Required
> [!IMPORTANT]
> Please review the icon mapping above. 
> 1. Are you happy with keeping `W` and `H` as letters alongside `X`, `Y`, `Z`? 
> 2. Do the proposed Lucide icons for properties like Opacity (`circleHalfFull`), Font Size (`moveVertical`), and Corner Radius (`squareRoundCorner`) look good to you, or would you like to swap any out?
