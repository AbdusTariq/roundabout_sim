const TWO_PI = Math.PI * 2;

class Vector2 {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }

  static fromPolar(angle, magnitude) {
    return new Vector2(Math.cos(angle) * magnitude, Math.sin(angle) * magnitude);
  }

  clone() {
    return new Vector2(this.x, this.y);
  }

  add(other) {
    return new Vector2(this.x + other.x, this.y + other.y);
  }

  subtract(other) {
    return new Vector2(this.x - other.x, this.y - other.y);
  }

  scale(factor) {
    return new Vector2(this.x * factor, this.y * factor);
  }

  length() {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  normalize() {
    const len = this.length();
    if (len === 0) {
      return new Vector2(0, 0);
    }
    return new Vector2(this.x / len, this.y / len);
  }

  distanceTo(other) {
    return this.subtract(other).length();
  }

  rotate(angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return new Vector2(this.x * cos - this.y * sin, this.x * sin + this.y * cos);
  }

  static lerp(a, b, t) {
    return new Vector2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
  }
}

class Polyline {
  constructor(points) {
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

  pointAt(distance) {
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

  directionAt(distance) {
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
  constructor(id, entryIndex, center, length, width, angle) {
    this.id = id;
    this.entryIndex = entryIndex;
    this.center = center;
    this.length = length;
    this.width = width;
    this.angle = angle;
    this.active = false;
  }

  contains(point) {
    const local = point.subtract(this.center).rotate(-this.angle);
    return Math.abs(local.x) <= this.length / 2 && Math.abs(local.y) <= this.width / 2;
  }
}

class Vehicle {
  constructor(route, baseSpeed) {
    this.route = route;
    this.progress = 0;
    this.speed = 0;
    this.maxSpeed = baseSpeed;
    this.acceleration = 18;
    this.deceleration = 22;
    this.length = 14;
    this.stopPoints = [
      { distance: route.entryStopDistance, signalIndex: route.entryIndex },
      { distance: route.exitHoldDistance, signalIndex: 5 + route.exitIndex }
    ];
  }

  get position() {
    return this.route.path.pointAt(this.progress);
  }

  get direction() {
    return this.route.path.directionAt(this.progress);
  }
}

class SignalController {
  constructor(getSensorLoads) {
    this.getSensorLoads = getSensorLoads;
    this.phaseIndex = 0;
    this.timer = 0;
    this.minGreen = 6;
    this.maxGreen = 14;
    this.yellow = 2.5;
    this.state = new Array(10).fill(false);
    this.yellowState = new Array(5).fill(false);
    this.state[0] = true;
    this.state[5] = true;
  }

  update(deltaTime) {
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

  advancePhase() {
    const prevPhase = this.phaseIndex;
    this.phaseIndex = (this.phaseIndex + 1) % 5;
    this.yellowState[prevPhase] = false;
    this.state.fill(false);
    this.state[this.phaseIndex] = true;
    this.state[5 + this.phaseIndex] = true;
  }
}

class TrafficSimulation {
  constructor(renderer) {
    this.renderer = renderer;
    this.vehicles = [];
    this.sensors = [];
    this.routes = [];
    this.routesByKey = new Map();
    this.spawnConfig = { spawnProbability: 0.4, maxVehicles: 60 };
    this.running = true;
    this.entryAngles = [];
    this.center = new Vector2(600, 450);
    this.spawnRadius = 460;
    this.approachRadius = 360;
    this.stopRadius = 315;
    this.innerRadius = 220;
    this.exitRadius = 360;
    for (let i = 0; i < 5; i += 1) {
      this.entryAngles.push(-Math.PI / 2 + (TWO_PI / 5) * i);
    }
    this.buildRoutes();
    this.buildSensors();
    this.signalController = new SignalController(() => this.calculateQueueLoads());
  }

  toggleRunning() {
    this.running = !this.running;
    return this.running;
  }

  setSpawnRate(rate) {
    this.spawnConfig.spawnProbability = Math.max(0, Math.min(1, rate));
  }

  getSensorStates() {
    return this.sensors.map((sensor) => sensor.active);
  }

  getSignalStates() {
    return this.signalController.update(0);
  }

  update(deltaTime) {
    if (this.running) {
      this.signalController.update(deltaTime);
      this.randomSpawn(deltaTime);
      this.updateVehicles(deltaTime);
    }

    this.updateSensors();
    this.renderer.render(this.vehicles, this.sensors, this.signalController.update(0));
  }

  calculateQueueLoads() {
    const loads = [0, 0, 0, 0, 0];
    for (const sensor of this.sensors) {
      if (sensor.active) {
        loads[sensor.entryIndex] += 1;
      }
    }
    return loads;
  }

  buildSensors() {
    this.sensors.length = 0;
    for (let i = 0; i < this.entryAngles.length; i += 1) {
      const angle = this.entryAngles[i];
      const centerOffset = Vector2.fromPolar(angle, this.stopRadius - 20);
      const center = this.center.add(centerOffset);
      this.sensors.push(new SensorZone(i, i, center, 46, 28, angle));
    }
  }

  buildRoutes() {
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

  createRoute(entryIndex, exitIndex) {
    const entryAngle = this.entryAngles[entryIndex];
    let exitAngle = this.entryAngles[exitIndex];
    while (exitAngle <= entryAngle) {
      exitAngle += TWO_PI;
    }

    const spawnPoint = this.center.add(Vector2.fromPolar(entryAngle, this.spawnRadius));
    const approachMid = this.center.add(Vector2.fromPolar(entryAngle, this.approachRadius));
    const stopPoint = this.center.add(Vector2.fromPolar(entryAngle, this.stopRadius));
    const mergePoint = this.center.add(Vector2.fromPolar(entryAngle, this.innerRadius));

    const arcPoints = [];
    const arcStart = entryAngle + 0.15;
    const arcEnd = exitAngle - 0.3;
    const arcLength = arcEnd - arcStart;
    const arcSteps = Math.max(4, Math.round(arcLength / (Math.PI / 6)));

    for (let i = 0; i <= arcSteps; i += 1) {
      const t = i / arcSteps;
      const angle = arcStart + (arcEnd - arcStart) * t;
      const point = this.center.add(Vector2.fromPolar(angle, this.innerRadius));
      arcPoints.push(point);
    }

    const exitPoint = this.center.add(Vector2.fromPolar(exitAngle - 0.1, this.innerRadius + 10));
    const exitOuter = this.center.add(Vector2.fromPolar(exitAngle, this.exitRadius));
    const farExit = this.center.add(Vector2.fromPolar(exitAngle, this.spawnRadius));

    const points = [spawnPoint, approachMid, stopPoint, mergePoint, ...arcPoints, exitPoint, exitOuter, farExit];

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

  randomSpawn(deltaTime) {
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

  updateVehicles(deltaTime) {
    const signalStates = this.signalController.update(0);

    const queuesByEntry = new Map();
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

    const pathGroups = new Map();
    for (const vehicle of this.vehicles) {
      const list = pathGroups.get(vehicle.route.key) ?? [];
      list.push(vehicle);
      pathGroups.set(vehicle.route.key, list);
    }
    for (const group of pathGroups.values()) {
      group.sort((a, b) => a.progress - b.progress);
    }

    const removal = [];

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

  updateSensors() {
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

  getSensorSummary() {
    return this.sensors.map((sensor, index) => ({
      label: `Entrance ${String.fromCharCode(65 + index)}`,
      active: sensor.active
    }));
  }

  getSignalSummary() {
    const signals = this.signalController.update(0);
    const summary = [];
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
  constructor(canvas) {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas rendering context could not be created");
    }
    this.ctx = ctx;
    this.canvas = canvas;
    this.center = new Vector2(600, 450);
    this.innerRadius = 200;
    this.outerRadius = 320;
  }

  render(vehicles, sensors, signals) {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawInfrastructure(signals);
    this.drawSensors(sensors);
    this.drawVehicles(vehicles);
  }

  drawInfrastructure(signals) {
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

  drawSignalHead(index, entryGreen, internalGreen) {
    const angle = -Math.PI / 2 + (TWO_PI / 5) * index;
    const base = this.center.add(Vector2.fromPolar(angle, this.outerRadius + 10));
    const inside = this.center.add(Vector2.fromPolar(angle, this.innerRadius + 30));

    this.drawLight(base, entryGreen);
    this.drawLight(inside, internalGreen);
  }

  drawLight(position, active) {
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

  drawSensors(sensors) {
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

  drawVehicles(vehicles) {
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

function updateReadout(list, rows) {
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

function bootstrap() {
  const canvas = document.getElementById("roundabout-canvas");
  const sensorList = document.getElementById("sensor-readout");
  const signalList = document.getElementById("signal-readout");
  const spawnSlider = document.getElementById("spawn-rate");
  const toggleButton = document.getElementById("toggle-sim");

  if (!canvas || !sensorList || !signalList || !spawnSlider || !toggleButton) {
    throw new Error("Required DOM nodes are missing");
  }

  const renderer = new Renderer(canvas);
  const simulation = new TrafficSimulation(renderer);

  spawnSlider.addEventListener("input", () => {
    simulation.setSpawnRate(Number(spawnSlider.value));
  });

  toggleButton.addEventListener("click", () => {
    const running = simulation.toggleRunning();
    toggleButton.textContent = running ? "Pause" : "Resume";
  });

  let lastTimestamp = performance.now();

  const tick = (timestamp) => {
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
