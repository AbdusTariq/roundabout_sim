const TWO_PI = Math.PI * 2;

interface Route {
  key: string;
  entryIndex: number;
  exitIndex: number;
  path: Polyline;
  entryStopDistance: number;
  mergeDistance: number;
  exitHoldDistance: number;
}

interface StopPoint {
  distance: number;
  signalIndex: number;
}

class Vector2 {
  constructor(public x: number, public y: number) {}

  static fromPolar(angle: number, magnitude: number): Vector2 {
    return new Vector2(Math.cos(angle) * magnitude, Math.sin(angle) * magnitude);
  }

  clone(): Vector2 {
    return new Vector2(this.x, this.y);
  }

  add(other: Vector2): Vector2 {
    return new Vector2(this.x + other.x, this.y + other.y);
  }

  subtract(other: Vector2): Vector2 {
    return new Vector2(this.x - other.x, this.y - other.y);
  }

  scale(factor: number): Vector2 {
    return new Vector2(this.x * factor, this.y * factor);
  }

  length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  normalize(): Vector2 {
    const len = this.length();
    if (len === 0) {
      return new Vector2(0, 0);
    }
    return new Vector2(this.x / len, this.y / len);
  }

  distanceTo(other: Vector2): number {
    return this.subtract(other).length();
  }

  rotate(angle: number): Vector2 {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return new Vector2(this.x * cos - this.y * sin, this.x * sin + this.y * cos);
  }

  static lerp(a: Vector2, b: Vector2, t: number): Vector2 {
    return new Vector2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
  }
}

class Polyline {
  points: Vector2[];
  segmentLengths: number[];
  cumulativeLengths: number[];
  totalLength: number;

  constructor(points: Vector2[]) {
    if (points.length < 2) {
      throw new Error("Polyline requires at least two points");
    }
    this.points = points;
    this.segmentLengths = [];
    this.cumulativeLengths = [0];
    let total = 0;
    for (let i = 0; i < points.length - 1; i += 1) {
      const len = points[i].distanceTo(points[i + 1]);
      this.segmentLengths.push(len);
      total += len;
      this.cumulativeLengths.push(total);
    }
    this.totalLength = total;
  }

  pointAt(distance: number): Vector2 {
    if (distance <= 0) {
      return this.points[0];
    }
    if (distance >= this.totalLength) {
      return this.points[this.points.length - 1];
    }
    for (let i = 0; i < this.segmentLengths.length; i += 1) {
      const start = this.cumulativeLengths[i];
      const end = this.cumulativeLengths[i + 1];
      if (distance >= start && distance <= end) {
        const t = (distance - start) / (end - start);
        return Vector2.lerp(this.points[i], this.points[i + 1], t);
      }
    }
    return this.points[this.points.length - 1];
  }

  directionAt(distance: number): Vector2 {
    if (distance <= 0) {
      return this.points[1].subtract(this.points[0]).normalize();
    }
    if (distance >= this.totalLength) {
      const last = this.points.length - 1;
      return this.points[last].subtract(this.points[last - 1]).normalize();
    }
    for (let i = 0; i < this.segmentLengths.length; i += 1) {
      const start = this.cumulativeLengths[i];
      const end = this.cumulativeLengths[i + 1];
      if (distance >= start && distance <= end) {
        return this.points[i + 1].subtract(this.points[i]).normalize();
      }
    }
    return new Vector2(1, 0);
  }
}

class SensorZone {
  public active = false;

  constructor(
    public readonly id: number,
    public readonly entryIndex: number,
    public readonly center: Vector2,
    public readonly length: number,
    public readonly width: number,
    public readonly angle: number
  ) {}

  contains(point: Vector2): boolean {
    const local = point.subtract(this.center).rotate(-this.angle);
    return Math.abs(local.x) <= this.length / 2 && Math.abs(local.y) <= this.width / 2;
  }
}

class Vehicle {
  public progress = 0;
  public speed = 0;
  public readonly maxSpeed: number;
  public readonly acceleration: number;
  public readonly deceleration: number;
  public readonly length = 14;
  public readonly stopPoints: StopPoint[];

  constructor(
    public readonly route: Route,
    baseSpeed: number
  ) {
    this.maxSpeed = baseSpeed;
    this.acceleration = 18; // m/s^2 scaled to simulation units
    this.deceleration = 22;
    this.stopPoints = [
      { distance: route.entryStopDistance, signalIndex: route.entryIndex },
      { distance: route.exitHoldDistance, signalIndex: 5 + route.exitIndex }
    ];
  }

  get position(): Vector2 {
    return this.route.path.pointAt(this.progress);
  }

  get direction(): Vector2 {
    return this.route.path.directionAt(this.progress);
  }
}

class SignalController {
  private phaseIndex = 0;
  private timer = 0;
  private readonly minGreen = 6;
  private readonly maxGreen = 14;
  private readonly yellow = 2.5;
  private state: boolean[] = new Array(10).fill(false);
  private yellowState: boolean[] = new Array(5).fill(false);

  constructor(private readonly getSensorLoads: () => number[]) {
    this.state[0] = true;
    this.state[5] = true;
  }

  update(deltaTime: number): boolean[] {
    this.timer += deltaTime;
    const loads = this.getSensorLoads();
    const currentLoad = loads[this.phaseIndex] ?? 0;
    const greenDuration = this.minGreen + Math.min(currentLoad * 1.8, this.maxGreen - this.minGreen);

    if (this.timer >= greenDuration && !this.yellowState[this.phaseIndex]) {
      this.yellowState[this.phaseIndex] = true;
      this.timer = 0;
    } else if (this.yellowState[this.phaseIndex] && this.timer >= this.yellow) {
      this.advancePhase();
      this.timer = 0;
    }

    return this.state;
  }

  private advancePhase(): void {
    const prevPhase = this.phaseIndex;
    this.phaseIndex = (this.phaseIndex + 1) % 5;
    this.yellowState[prevPhase] = false;
    this.state.fill(false);
    this.state[this.phaseIndex] = true;
    this.state[5 + this.phaseIndex] = true;
  }
}

interface SpawnConfig {
  spawnProbability: number;
  maxVehicles: number;
}

class TrafficSimulation {
  private readonly vehicles: Vehicle[] = [];
  private readonly sensors: SensorZone[] = [];
  private readonly routes: Route[] = [];
  private readonly routesByKey: Map<string, Route> = new Map();
  private readonly spawnConfig: SpawnConfig = { spawnProbability: 0.4, maxVehicles: 60 };
  private readonly signalController: SignalController;
  private running = true;

  private readonly entryAngles: number[] = [];
  private readonly center = new Vector2(600, 450);
  private readonly spawnRadius = 460;
  private readonly approachRadius = 360;
  private readonly stopRadius = 315;
  private readonly innerRadius = 220;
  private readonly exitRadius = 360;

  constructor(private readonly renderer: Renderer) {
    for (let i = 0; i < 5; i += 1) {
      this.entryAngles.push(-Math.PI / 2 + (TWO_PI / 5) * i);
    }

    this.buildRoutes();
    this.buildSensors();

    this.signalController = new SignalController(() => this.calculateQueueLoads());
  }

  toggleRunning(): boolean {
    this.running = !this.running;
    return this.running;
  }

  setSpawnRate(rate: number): void {
    this.spawnConfig.spawnProbability = Math.max(0, Math.min(1, rate));
  }

  getSensorStates(): boolean[] {
    return this.sensors.map((sensor) => sensor.active);
  }

  getSignalStates(): boolean[] {
    return this.signalController.update(0);
  }

  update(deltaTime: number): void {
    if (this.running) {
      this.signalController.update(deltaTime);
      this.randomSpawn(deltaTime);
      this.updateVehicles(deltaTime);
    }

    this.updateSensors();
    this.renderer.render(this.vehicles, this.sensors, this.signalController.update(0));
  }

  private calculateQueueLoads(): number[] {
    const loads: number[] = [0, 0, 0, 0, 0];
    for (const sensor of this.sensors) {
      if (sensor.active) {
        loads[sensor.entryIndex] += 1;
      }
    }
    return loads;
  }

  private buildSensors(): void {
    this.sensors.length = 0;
    for (let i = 0; i < this.entryAngles.length; i += 1) {
      const angle = this.entryAngles[i];
      const centerOffset = Vector2.fromPolar(angle, this.stopRadius - 20);
      const center = this.center.add(centerOffset);
      this.sensors.push(new SensorZone(i, i, center, 46, 28, angle));
    }
  }

  private buildRoutes(): void {
    for (let entry = 0; entry < 5; entry += 1) {
      for (let exit = 0; exit < 5; exit += 1) {
        if (entry === exit) {
          continue;
        }
        const route = this.createRoute(entry, exit);
        this.routes.push(route);
        this.routesByKey.set(route.key, route);
      }
    }
  }

  private createRoute(entryIndex: number, exitIndex: number): Route {
    const entryAngle = this.entryAngles[entryIndex];
    let exitAngle = this.entryAngles[exitIndex];
    while (exitAngle <= entryAngle) {
      exitAngle += TWO_PI;
    }

    const spawnPoint = this.center.add(Vector2.fromPolar(entryAngle, this.spawnRadius));
    const approachMid = this.center.add(Vector2.fromPolar(entryAngle, this.approachRadius));
    const stopPoint = this.center.add(Vector2.fromPolar(entryAngle, this.stopRadius));
    const mergePoint = this.center.add(Vector2.fromPolar(entryAngle, this.innerRadius));

    const arcPoints: Vector2[] = [];
    const arcStart = entryAngle + 0.15;
    const arcEnd = exitAngle - 0.3;
    const arcLength = arcEnd - arcStart;
    const arcSteps = Math.max(4, Math.round((arcLength / (Math.PI / 6))));

    for (let i = 0; i <= arcSteps; i += 1) {
      const t = i / arcSteps;
      const angle = arcStart + (arcEnd - arcStart) * t;
      const point = this.center.add(Vector2.fromPolar(angle, this.innerRadius));
      arcPoints.push(point);
    }

    const exitPoint = this.center.add(Vector2.fromPolar(exitAngle - 0.1, this.innerRadius + 10));
    const exitOuter = this.center.add(Vector2.fromPolar(exitAngle, this.exitRadius));
    const farExit = this.center.add(Vector2.fromPolar(exitAngle, this.spawnRadius));

    const points: Vector2[] = [spawnPoint, approachMid, stopPoint, mergePoint, ...arcPoints, exitPoint, exitOuter, farExit];

    const path = new Polyline(points);
    const entryStopDistance = path.cumulativeLengths[2];
    const mergeDistance = path.cumulativeLengths[3] + 4;
    const exitHoldDistance = path.totalLength - 120;

    return {
      key: `${entryIndex}-${exitIndex}`,
      entryIndex,
      exitIndex,
      path,
      entryStopDistance,
      mergeDistance,
      exitHoldDistance
    };
  }

  private randomSpawn(deltaTime: number): void {
    if (this.vehicles.length >= this.spawnConfig.maxVehicles) {
      return;
    }

    const probability = this.spawnConfig.spawnProbability * deltaTime;
    if (Math.random() > probability) {
      return;
    }

    const entryIndex = Math.floor(Math.random() * 5);
    let exitIndex = Math.floor(Math.random() * 5);
    while (exitIndex === entryIndex) {
      exitIndex = Math.floor(Math.random() * 5);
    }

    const route = this.routesByKey.get(`${entryIndex}-${exitIndex}`);
    if (!route) {
      return;
    }

    const vehicle = new Vehicle(route, 70 + Math.random() * 20);
    this.vehicles.push(vehicle);
  }

  private updateVehicles(deltaTime: number): void {
    const signalStates = this.signalController.update(0);

    const queuesByEntry: Map<number, Vehicle[]> = new Map();
    for (const vehicle of this.vehicles) {
      if (vehicle.progress < vehicle.route.mergeDistance) {
        const queue = queuesByEntry.get(vehicle.route.entryIndex) ?? [];
        queue.push(vehicle);
        queuesByEntry.set(vehicle.route.entryIndex, queue);
      }
    }
    for (const queue of queuesByEntry.values()) {
      queue.sort((a, b) => a.progress - b.progress);
    }

    const pathGroups: Map<string, Vehicle[]> = new Map();
    for (const vehicle of this.vehicles) {
      const list = pathGroups.get(vehicle.route.key) ?? [];
      list.push(vehicle);
      pathGroups.set(vehicle.route.key, list);
    }
    for (const group of pathGroups.values()) {
      group.sort((a, b) => a.progress - b.progress);
    }

    const removal: Vehicle[] = [];

    for (const vehicle of this.vehicles) {
      let maxProgress = vehicle.route.path.totalLength;

      const queue = queuesByEntry.get(vehicle.route.entryIndex);
      if (queue) {
        const idx = queue.indexOf(vehicle);
        if (idx > 0) {
          const front = queue[idx - 1];
          maxProgress = Math.min(maxProgress, front.progress - front.length - 10);
        }
      }

      const group = pathGroups.get(vehicle.route.key);
      if (group) {
        const idx = group.indexOf(vehicle);
        if (idx > 0) {
          const front = group[idx - 1];
          maxProgress = Math.min(maxProgress, front.progress - front.length - 6);
        }
      }

      for (const stopPoint of vehicle.stopPoints) {
        if (vehicle.progress <= stopPoint.distance - 2) {
          const signalGreen = signalStates[stopPoint.signalIndex];
          if (!signalGreen) {
            maxProgress = Math.min(maxProgress, stopPoint.distance - 4);
          }
        }
      }

      maxProgress = Math.max(maxProgress, vehicle.progress);

      const targetSpeed = Math.min(vehicle.maxSpeed, (maxProgress - vehicle.progress) * 1.6);
      const shouldBrake = vehicle.speed > targetSpeed;

      const accelRate = shouldBrake ? -vehicle.deceleration : vehicle.acceleration;
      vehicle.speed += accelRate * deltaTime;
      vehicle.speed = Math.max(0, Math.min(vehicle.speed, vehicle.maxSpeed));

      const distanceStep = vehicle.speed * deltaTime;
      vehicle.progress = Math.min(maxProgress, vehicle.progress + distanceStep);

      if (vehicle.progress >= vehicle.route.path.totalLength - 5) {
        removal.push(vehicle);
      }
    }

    for (const vehicle of removal) {
      const index = this.vehicles.indexOf(vehicle);
      if (index >= 0) {
        this.vehicles.splice(index, 1);
      }
    }
  }

  private updateSensors(): void {
    for (const sensor of this.sensors) {
      sensor.active = false;
      for (const vehicle of this.vehicles) {
        const position = vehicle.position;
        if (sensor.contains(position)) {
          sensor.active = true;
          break;
        }
      }
    }
  }

  getSensorSummary(): { label: string; active: boolean }[] {
    return this.sensors.map((sensor, index) => ({
      label: `Entrance ${String.fromCharCode(65 + index)}`,
      active: sensor.active
    }));
  }

  getSignalSummary(): { label: string; active: boolean }[] {
    const signals = this.signalController.update(0);
    const summary: { label: string; active: boolean }[] = [];
    for (let i = 0; i < 5; i += 1) {
      summary.push({ label: `Entry ${String.fromCharCode(65 + i)}`, active: signals[i] });
    }
    for (let i = 0; i < 5; i += 1) {
      summary.push({ label: `Internal ${String.fromCharCode(65 + i)}`, active: signals[5 + i] });
    }
    return summary;
  }
}

class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly canvas: HTMLCanvasElement;
  private readonly center = new Vector2(600, 450);
  private readonly innerRadius = 200;
  private readonly outerRadius = 320;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas rendering context could not be created");
    }
    this.ctx = ctx;
    this.canvas = canvas;
  }

  render(vehicles: Vehicle[], sensors: SensorZone[], signals: boolean[]): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawInfrastructure(signals);
    this.drawSensors(sensors);
    this.drawVehicles(vehicles);
  }

  private drawInfrastructure(signals: boolean[]): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(this.center.x, this.center.y);

    ctx.fillStyle = "#2d333d";
    ctx.beginPath();
    ctx.arc(0, 0, this.outerRadius + 180, 0, TWO_PI);
    ctx.fill();

    ctx.fillStyle = "#1f252d";
    ctx.beginPath();
    ctx.arc(0, 0, this.outerRadius + 24, 0, TWO_PI);
    ctx.fill();

    ctx.fillStyle = "#151921";
    ctx.beginPath();
    ctx.arc(0, 0, this.outerRadius - 58, 0, TWO_PI);
    ctx.fill("evenodd");

    for (let i = 0; i < 5; i += 1) {
      const angle = -Math.PI / 2 + (TWO_PI / 5) * i;
      const dir = Vector2.fromPolar(angle, 1);
      const start = dir.scale(this.outerRadius + 180);
      const end = dir.scale(this.outerRadius + 20);
      ctx.strokeStyle = "#3d444f";
      ctx.lineWidth = 80;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();

      ctx.strokeStyle = "#fafafa";
      ctx.setLineDash([18, 18]);
      ctx.lineWidth = 4;
      const mid = dir.scale(this.outerRadius + 100);
      const inPoint = dir.scale(this.outerRadius - 60);
      ctx.beginPath();
      ctx.moveTo(mid.x, mid.y);
      ctx.lineTo(inPoint.x, inPoint.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.fillStyle = "#0f1118";
    ctx.beginPath();
    ctx.arc(0, 0, this.innerRadius - 60, 0, TWO_PI);
    ctx.fill();

    ctx.restore();

    for (let i = 0; i < 5; i += 1) {
      this.drawSignalHead(i, signals[i], signals[5 + i]);
    }
  }

  private drawSignalHead(index: number, entryGreen: boolean, internalGreen: boolean): void {
    const angle = -Math.PI / 2 + (TWO_PI / 5) * index;
    const base = this.center.add(Vector2.fromPolar(angle, this.outerRadius + 10));
    const inside = this.center.add(Vector2.fromPolar(angle, this.innerRadius + 30));

    this.drawLight(base, entryGreen);
    this.drawLight(inside, internalGreen);
  }

  private drawLight(position: Vector2, active: boolean): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = "#0b0d12";
    ctx.beginPath();
    ctx.arc(position.x, position.y, 18, 0, TWO_PI);
    ctx.fill();

    const color = active ? "#5cff88" : "#ff5959";
    ctx.fillStyle = color;
    ctx.globalAlpha = active ? 0.95 : 0.4;
    ctx.beginPath();
    ctx.arc(position.x, position.y, 12, 0, TWO_PI);
    ctx.fill();
    ctx.restore();
  }

  private drawSensors(sensors: SensorZone[]): void {
    const ctx = this.ctx;
    for (const sensor of sensors) {
      ctx.save();
      ctx.translate(sensor.center.x, sensor.center.y);
      ctx.rotate(sensor.angle);
      ctx.fillStyle = sensor.active ? "rgba(92, 255, 136, 0.35)" : "rgba(255, 89, 89, 0.25)";
      ctx.fillRect(-sensor.length / 2, -sensor.width / 2, sensor.length, sensor.width);
      ctx.restore();
    }
  }

  private drawVehicles(vehicles: Vehicle[]): void {
    const ctx = this.ctx;
    for (const vehicle of vehicles) {
      const position = vehicle.position;
      const direction = vehicle.direction;
      const angle = Math.atan2(direction.y, direction.x);

      ctx.save();
      ctx.translate(position.x, position.y);
      ctx.rotate(angle);
      ctx.fillStyle = "#33a7ff";
      ctx.fillRect(-vehicle.length / 2, -6, vehicle.length, 12);
      ctx.fillStyle = "#11161f";
      ctx.fillRect(-vehicle.length / 2 + 2, -4, vehicle.length - 4, 8);
      ctx.restore();
    }
  }
}

function updateReadout(list: HTMLElement, rows: { label: string; active: boolean }[]): void {
  list.innerHTML = "";
  for (const row of rows) {
    const li = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = row.label;
    const badge = document.createElement("span");
    badge.classList.add("badge", row.active ? "active" : "inactive");
    badge.textContent = row.active ? "ACTIVE" : "IDLE";
    li.append(label, badge);
    list.appendChild(li);
  }
}

function bootstrap(): void {
  const canvas = document.getElementById("roundabout-canvas") as HTMLCanvasElement | null;
  const sensorList = document.getElementById("sensor-readout");
  const signalList = document.getElementById("signal-readout");
  const spawnSlider = document.getElementById("spawn-rate") as HTMLInputElement | null;
  const toggleButton = document.getElementById("toggle-sim") as HTMLButtonElement | null;

  if (!canvas || !sensorList || !signalList || !spawnSlider || !toggleButton) {
    throw new Error("Required DOM nodes are missing");
  }

  const renderer = new Renderer(canvas);
  const simulation = new TrafficSimulation(renderer);

  if (spawnSlider) {
    spawnSlider.addEventListener("input", () => {
      simulation.setSpawnRate(Number(spawnSlider.value));
    });
  }

  if (toggleButton) {
    toggleButton.addEventListener("click", () => {
      const running = simulation.toggleRunning();
      toggleButton.textContent = running ? "Pause" : "Resume";
    });
  }

  let lastTimestamp = performance.now();

  const tick = (timestamp: number) => {
    const deltaTime = Math.min(0.1, (timestamp - lastTimestamp) / 1000);
    lastTimestamp = timestamp;
    simulation.update(deltaTime);
    updateReadout(sensorList, simulation.getSensorSummary());
    updateReadout(signalList, simulation.getSignalSummary());
    requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
}

document.addEventListener("DOMContentLoaded", bootstrap);
