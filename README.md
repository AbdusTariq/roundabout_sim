# Adaptive Roundabout Traffic Simulation

This project visualizes a five-arm roundabout with adaptive signal control. Traffic is generated stochastically, vehicles accelerate and brake naturally, and ten coordinated signal heads (five entries and five internal) manage movements. When vehicles occupy the stop-line detection zones their sensor state is raised, providing input to the signal logic and any external controller (e.g., the Python algorithm described in the project brief).

## Features

- **Canvas-based layout** matching the provided sketch with five highway approaches and circulating lanes.
- **Vehicle dynamics** with per-car acceleration, deceleration, collision spacing, and unique entry/exit routing.
- **Stochastic vehicle generation** with adjustable spawn probability and a pause/resume toggle.
- **Sensor emulation** that records when vehicles occupy any of the five inductive-style detection zones.
- **Signal coordination** between entry signals and the matching internal signals inside the roundabout. A timing controller samples queue lengths derived from the sensor states to extend greens adaptively.
- **Data readouts** listing the ten signal states and five sensor states in real time for integration with external logic.

## Getting Started

1. Install dependencies:

   ```bash
   npm install
   ```

   > **Note:** The sandbox used to create this commit could not reach the npm registry, so `node_modules` is not included. Install locally to compile TypeScript.

2. Build the TypeScript sources (outputs to `public/assets`):

   ```bash
   npm run build
   ```

3. Launch a static file server of your choice pointed at the `public/` directory, or use the convenience script:

   ```bash
   npm run start
   ```

4. Open `http://localhost:3000` (the default for `serve`) or the port provided by your HTTP server.

## Project Structure

```
public/
  index.html        # Simulation shell and UI controls
  styles.css        # Layout and palette definitions
  assets/main.js    # Compiled JavaScript bundle
src/
  main.ts           # TypeScript source for rendering and simulation logic
```

The simulation can also be run by opening `public/index.html` directly in a modern browser because the compiled JavaScript bundle is committed alongside the TypeScript source.

## Next Steps

- Replace the in-browser signal controller with a bridge that forwards sensor states to the Python logic and consumes returned signal commands.
- Introduce richer vehicle behaviour (lane changes, heavy vehicle profiles).
- Expand sensor modeling to include pedestrian push buttons and emergency pre-emption inputs.
