# App Logo Assets

## Required Logo Files

### 1. App Logo (app-logo.png)

- **Purpose**: Login screen logo with white circular background
- **Specifications**:
  - Format: PNG with transparency
  - Size: 160x160px (80dp at 2x density)
  - Background: White circle
  - Logo: Centered within circle
- **Usage**: Login screen header above app title

### 2. Header Icon (header-icon.png)

- **Purpose**: Main screen header top-left icon
- **Specifications**:
  - Format: PNG with transparency
  - Size: 64x64px (32dp at 2x density)
  - Style: Minimalist icon suitable for header
- **Usage**: Main screen header left side

## Implementation Status

- [ ] app-logo.png - **NEEDED** for login screen
- [ ] header-icon.png - **NEEDED** for main screen header

## Integration Notes

The LoginScreen currently uses a placeholder (🏥 emoji) in a white circle. Once the actual logo is provided:

1. Replace the logoPlaceholder component with an Image component
2. Import the logo: `import AppLogo from '../../assets/images/app-logo.png'`
3. Use: `<Image source={AppLogo} style={styles.logo} />`

The Header component will need similar integration for the header icon.

## Current Implementation

**LoginScreen.tsx** (line ~127):

```jsx
<View style={styles.logoPlaceholder}>
  <Text style={styles.logoText}>🏥</Text>
</View>
```

This should be replaced with:

```jsx
<Image source={AppLogo} style={styles.logo} resizeMode="contain" />
```

## Styling

The white circular background is currently implemented in CSS. When adding the actual logo, ensure it includes the white circle background or maintain the CSS styling.

