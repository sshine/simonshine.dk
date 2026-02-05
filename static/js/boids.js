const ColorConfig = {
    echo: {
        enabled: false,
        bufferSize: 10,
        echoRate: 0.008,
        decayRate: 0.95
    },
    original: {
        enabled: true,
        blendRate: 0.02
    },
    clique: {
        enabled: true,
        minSize: 10,
        timeThreshold: 300,
        colorTolerance: 15,
        proximityRadius: 30,
        explosionForce: 3,
        explosionDuration: 60
    },
    grid: {
        enabled: false,
        spacing: 75,
        attractionStrength: 0.3
    },
    nixosLogo: {
        enabled: true,
        cycleLength: 3300,
        phaseInDuration: 600,
        activeDuration: 900,
        phaseOutDuration: 120,
        maxSpeed: 3,
        captureRadius: 200,
        expandedCaptureRadius: 400,
        scale: 0.3,
        centerX: 0,
        centerY: 0,
        debugDraw: false,
        strictness: 0.95,
        attraction: {
            enabled: true,
            strength: 0.02,
            maxDistance: 600
        }
    }
};

const NixOSLogoPolygons = [
    [[-624.0, 249.4], [-496.0, 27.7], [64.0, 997.7], [-192.0, 997.7], [-320.0, 775.9], [-448.0, 997.7], [-576.0, 997.7], [-640.0, 886.8], [-448.0, 554.3]],
    [[-528.0, -415.7], [-272.0, -415.7], [-832.0, 554.3], [-960.0, 332.6], [-832.0, 110.9], [-1088.0, 110.9], [-1152.0, 0], [-1088.0, -110.9], [-704.0, -110.9]],
    [[96.0, -665.1], [224.0, -443.4], [-896.0, -443.4], [-768.0, -665.1], [-512.0, -665.1], [-640.0, -886.8], [-576.0, -997.7], [-448.0, -997.7], [-256.0, -665.1]],
    [[624.0, -249.4], [496.0, -27.7], [-64.0, -997.7], [192.0, -997.7], [320.0, -775.9], [448.0, -997.7], [576.0, -997.7], [640.0, -886.8], [448.0, -554.3]],
    [[528.0, 415.7], [272.0, 415.7], [832.0, -554.3], [960.0, -332.6], [832.0, -110.9], [1088.0, -110.9], [1152.0, 0], [1088.0, 110.9], [704.0, 110.9]],
    [[-96.0, 665.1], [-224.0, 443.4], [896.0, 443.4], [768.0, 665.1], [512.0, 665.1], [640.0, 886.8], [576.0, 997.7], [448.0, 997.7], [256.0, 665.1]]
];

const NixOSLogoSegments = [];
for (let polyIndex = 0; polyIndex < NixOSLogoPolygons.length; polyIndex++) {
    const polygon = NixOSLogoPolygons[polyIndex];
    for (let i = 0; i < polygon.length; i++) {
        const start = polygon[i];
        const end = polygon[(i + 1) % polygon.length];
        NixOSLogoSegments.push({
            start: start,
            end: end,
            polyIndex: polyIndex,
            segmentIndex: i
        });
    }
}

class Vector2 {
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }

    add(v) {
        return new Vector2(this.x + v.x, this.y + v.y);
    }

    subtract(v) {
        return new Vector2(this.x - v.x, this.y - v.y);
    }

    multiply(scalar) {
        return new Vector2(this.x * scalar, this.y * scalar);
    }

    divide(scalar) {
        return new Vector2(this.x / scalar, this.y / scalar);
    }

    magnitude() {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }

    normalize() {
        const mag = this.magnitude();
        if (mag === 0) return new Vector2(0, 0);
        return this.divide(mag);
    }

    limit(max) {
        if (this.magnitude() > max) {
            return this.normalize().multiply(max);
        }
        return new Vector2(this.x, this.y);
    }

    distance(v) {
        return Math.sqrt((this.x - v.x) ** 2 + (this.y - v.y) ** 2);
    }
}

class SpatialHash {
    constructor(cellSize) {
        this.cellSize = cellSize;
        this.cells = new Map();
    }

    clear() {
        this.cells.clear();
    }

    getKey(x, y) {
        const cellX = Math.floor(x / this.cellSize);
        const cellY = Math.floor(y / this.cellSize);
        return `${cellX},${cellY}`;
    }

    insert(boid) {
        const key = this.getKey(boid.position.x, boid.position.y);
        if (!this.cells.has(key)) {
            this.cells.set(key, []);
        }
        this.cells.get(key).push(boid);
    }

    query(position, radius) {
        const neighbors = [];
        const cellsToCheck = Math.ceil(radius / this.cellSize);

        for (let dx = -cellsToCheck; dx <= cellsToCheck; dx++) {
            for (let dy = -cellsToCheck; dy <= cellsToCheck; dy++) {
                const cellX = Math.floor(position.x / this.cellSize) + dx;
                const cellY = Math.floor(position.y / this.cellSize) + dy;
                const key = `${cellX},${cellY}`;

                if (this.cells.has(key)) {
                    const cell = this.cells.get(key);
                    for (const boid of cell) {
                        if (position.distance(boid.position) <= radius) {
                            neighbors.push(boid);
                        }
                    }
                }
            }
        }

        return neighbors;
    }
}

class Boid {
    constructor(x, y) {
        this.position = new Vector2(x, y);
        this.velocity = new Vector2(
            Math.random() * 4 - 2,
            Math.random() * 4 - 2
        );
        this.acceleration = new Vector2(0, 0);
        this.maxForce = 0.03;
        this.maxSpeed = 2;
        this.perceptionRadius = 25;
        this.hue = 120;
        this.hueInfluenceRadius = 15;
        this.hueBlendRate = 0.02;

        this.colorMemory = [];
        this.echoPhase = 0;
        this.cliqueTimer = 0;
        this.lastCliqueCheck = 0;
        this.explosionTimer = 0;
        this.explosionDirection = new Vector2(0, 0);
        this.logoFollowing = false;
        this.logoPathIndex = -1;
        this.logoTransition = 0;
        this.logoSegmentStart = -1;
        this.logoSegmentEnd = -1;
        this.logoSegmentProgress = 0;
        this.logoSpeed = ColorConfig.nixosLogo.maxSpeed * (0.7 + Math.random() * 0.6);
    }

    addToColorMemory(hue) {
        if (ColorConfig.echo.enabled) {
            this.colorMemory.push(hue);
            if (this.colorMemory.length > ColorConfig.echo.bufferSize) {
                this.colorMemory.shift();
            }
        }
    }

    edges(width, height) {
        if (this.position.x > width) this.position.x = 0;
        else if (this.position.x < 0) this.position.x = width;

        if (this.position.y > height) this.position.y = 0;
        else if (this.position.y < 0) this.position.y = height;
    }

    align(boids) {
        const steering = new Vector2(0, 0);
        let total = 0;

        for (const other of boids) {
            if (other !== this) {
                steering.x += other.velocity.x;
                steering.y += other.velocity.y;
                total++;
            }
        }

        if (total > 0) {
            const avg = steering.divide(total);
            const normalized = avg.normalize().multiply(this.maxSpeed);
            const steer = normalized.subtract(this.velocity);
            return steer.limit(this.maxForce);
        }

        return steering;
    }

    cohesion(boids) {
        const steering = new Vector2(0, 0);
        let total = 0;

        for (const other of boids) {
            if (other !== this) {
                steering.x += other.position.x;
                steering.y += other.position.y;
                total++;
            }
        }

        if (total > 0) {
            const center = steering.divide(total);
            const desired = center.subtract(this.position);
            const normalized = desired.normalize().multiply(this.maxSpeed);
            const steer = normalized.subtract(this.velocity);
            return steer.limit(this.maxForce);
        }

        return steering;
    }

    separation(boids) {
        const desiredSeparation = 20;
        const steering = new Vector2(0, 0);
        let total = 0;

        for (const other of boids) {
            const d = this.position.distance(other.position);
            if (other !== this && d < desiredSeparation && d > 0) {
                const diff = this.position.subtract(other.position);
                const normalized = diff.normalize();
                const weighted = normalized.divide(d);
                steering.x += weighted.x;
                steering.y += weighted.y;
                total++;
            }
        }

        if (total > 0) {
            const avg = steering.divide(total);
            const normalized = avg.normalize().multiply(this.maxSpeed);
            const steer = normalized.subtract(this.velocity);
            return steer.limit(this.maxForce);
        }

        return steering;
    }

    gridAttraction() {
        if (!ColorConfig.grid.enabled) return new Vector2(0, 0);

        const spacing = ColorConfig.grid.spacing;
        const x = this.position.x;
        const y = this.position.y;

        const nearestGridX = Math.round(x / spacing) * spacing;
        const nearestGridY = Math.round(y / spacing) * spacing;

        const forceX = (nearestGridX - x) * ColorConfig.grid.attractionStrength;
        const forceY = (nearestGridY - y) * ColorConfig.grid.attractionStrength;

        const steering = new Vector2(forceX, forceY);
        return steering.limit(this.maxForce);
    }

    updateLogoFollowing(frameCount) {
        if (!ColorConfig.nixosLogo.enabled) return;

        const config = ColorConfig.nixosLogo;
        const cyclePosition = frameCount % config.cycleLength;

        if (cyclePosition < config.phaseInDuration) {
            this.logoTransition = cyclePosition / config.phaseInDuration;
            this.captureForLogo(frameCount);
        } else if (cyclePosition < config.phaseInDuration + config.activeDuration) {
            this.logoTransition = 1;
            this.logoFollowing = true;
        } else if (cyclePosition < config.phaseInDuration + config.activeDuration + config.phaseOutDuration) {
            const phaseOutProgress = (cyclePosition - config.phaseInDuration - config.activeDuration) / config.phaseOutDuration;
            this.logoTransition = 1 - phaseOutProgress;
            if (this.logoTransition <= 0) {
                this.logoFollowing = false;
                this.logoPathIndex = -1;
            }
        } else {
            this.logoTransition = 0;
            this.logoFollowing = false;
            this.logoPathIndex = -1;
        }
    }

    captureForLogo(frameCount) {
        if (this.logoFollowing) return;

        const config = ColorConfig.nixosLogo;
        const centerX = config.centerX;
        const centerY = config.centerY;

        const cyclePosition = frameCount % config.cycleLength;
        let currentCaptureRadius = config.captureRadius;

        if (cyclePosition < config.phaseInDuration) {
            const phaseInProgress = cyclePosition / config.phaseInDuration;
            currentCaptureRadius = config.expandedCaptureRadius * (1 - phaseInProgress) + config.captureRadius * phaseInProgress;
        }

        let minDistance = Infinity;
        let closestSegmentIndex = -1;

        for (let i = 0; i < NixOSLogoSegments.length; i++) {
            const segment = NixOSLogoSegments[i];
            const startX = centerX + segment.start[0] * config.scale;
            const startY = centerY + segment.start[1] * config.scale;
            const endX = centerX + segment.end[0] * config.scale;
            const endY = centerY + segment.end[1] * config.scale;

            const distance = this.distanceToLineSegment(this.position.x, this.position.y, startX, startY, endX, endY);

            if (distance < minDistance) {
                minDistance = distance;
                closestSegmentIndex = i;
            }
        }

        if (minDistance < currentCaptureRadius) {
            this.logoFollowing = true;
            this.logoSegmentStart = closestSegmentIndex;
            this.logoSegmentEnd = closestSegmentIndex;
            this.logoSegmentProgress = 0;
        }

        if (!this.logoFollowing && minDistance < currentCaptureRadius * 1.5) {
            const distanceToCenter = Math.sqrt((this.position.x - centerX) ** 2 + (this.position.y - centerY) ** 2);
            if (distanceToCenter > 50) {
                this.logoFollowing = true;
                this.logoSegmentStart = closestSegmentIndex;
                this.logoSegmentEnd = closestSegmentIndex;
                this.logoSegmentProgress = 0;
            }
        }
    }

    distanceToLineSegment(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const length = Math.sqrt(dx * dx + dy * dy);

        if (length === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);

        const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (length * length)));
        const projX = x1 + t * dx;
        const projY = y1 + t * dy;

        return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
    }

    logoPathFollowing() {
        if (!this.logoFollowing || this.logoSegmentStart === -1) {
            return new Vector2(0, 0);
        }

        const config = ColorConfig.nixosLogo;
        const centerX = config.centerX;
        const centerY = config.centerY;
        const segment = NixOSLogoSegments[this.logoSegmentStart];

        const startX = centerX + segment.start[0] * config.scale;
        const startY = centerY + segment.start[1] * config.scale;
        const endX = centerX + segment.end[0] * config.scale;
        const endY = centerY + segment.end[1] * config.scale;

        this.logoSegmentProgress += this.logoSpeed / Math.sqrt((endX - startX) ** 2 + (endY - startY) ** 2);

        if (this.logoSegmentProgress >= 1.0) {
            this.findNextSegment();
            this.logoSegmentProgress = 0;
        }

        const targetX = startX + (endX - startX) * this.logoSegmentProgress;
        const targetY = startY + (endY - startY) * this.logoSegmentProgress;

        const toTarget = new Vector2(targetX - this.position.x, targetY - this.position.y);
        const distanceToTarget = toTarget.magnitude();

        const forwardDirection = new Vector2(endX - startX, endY - startY).normalize();

        const correctionForce = toTarget.multiply(config.strictness);
        const forwardForce = forwardDirection.multiply(1 - config.strictness);

        const combinedForce = correctionForce.add(forwardForce);

        return combinedForce.normalize().multiply(this.logoSpeed);
    }

    logoAttraction(frameCount) {
        const config = ColorConfig.nixosLogo;
        if (!config.enabled || !config.attraction.enabled) return new Vector2(0, 0);

        const cyclePosition = frameCount % config.cycleLength;

        let attractionMultiplier = 0;
        if (cyclePosition < config.phaseInDuration) {
            attractionMultiplier = cyclePosition / config.phaseInDuration;
        } else if (cyclePosition < config.phaseInDuration + config.activeDuration) {
            attractionMultiplier = 1;
        } else if (cyclePosition < config.phaseInDuration + config.activeDuration + config.phaseOutDuration) {
            const phaseOutProgress = (cyclePosition - config.phaseInDuration - config.activeDuration) / config.phaseOutDuration;
            attractionMultiplier = 1 - phaseOutProgress;
        }

        if (attractionMultiplier === 0 || this.logoFollowing) return new Vector2(0, 0);

        const centerX = config.centerX;
        const centerY = config.centerY;
        const distance = Math.sqrt((this.position.x - centerX) ** 2 + (this.position.y - centerY) ** 2);

        if (distance > config.attraction.maxDistance || distance < 10) return new Vector2(0, 0);

        const direction = new Vector2(centerX - this.position.x, centerY - this.position.y);
        const normalizedDirection = direction.normalize();

        const distanceFactor = 1 - (distance / config.attraction.maxDistance);
        const attractionForce = normalizedDirection.multiply(config.attraction.strength * attractionMultiplier * distanceFactor);

        return attractionForce;
    }

    findNextSegment() {
        const config = ColorConfig.nixosLogo;
        const centerX = config.centerX;
        const centerY = config.centerY;
        const currentSegment = NixOSLogoSegments[this.logoSegmentStart];
        const currentEndX = centerX + currentSegment.end[0] * config.scale;
        const currentEndY = centerY + currentSegment.end[1] * config.scale;

        let minDistance = Infinity;
        let nextSegmentIndex = -1;

        for (let i = 0; i < NixOSLogoSegments.length; i++) {
            if (i === this.logoSegmentStart) continue;

            const segment = NixOSLogoSegments[i];
            const startX = centerX + segment.start[0] * config.scale;
            const startY = centerY + segment.start[1] * config.scale;

            const distance = Math.sqrt((currentEndX - startX) ** 2 + (currentEndY - startY) ** 2);

            if (distance < minDistance && distance < 50 * config.scale) {
                minDistance = distance;
                nextSegmentIndex = i;
            }
        }

        if (nextSegmentIndex !== -1) {
            this.logoSegmentStart = nextSegmentIndex;
        }
    }

    flock(spatialHash, frameCount) {
        this.updateLogoFollowing(frameCount);

        if (this.logoFollowing && this.logoTransition > 0.5) {
            const logoDirection = this.logoPathFollowing();
            this.velocity = logoDirection;
            this.updateHue([]);
            return;
        }

        const neighbors = spatialHash.query(this.position, this.perceptionRadius);

        const alignment = this.align(neighbors);
        const cohesionForce = this.cohesion(neighbors);
        const separationForce = this.separation(neighbors);
        const gridForce = this.gridAttraction();
        const explosion = this.explosionForce();
        const logoDirection = this.logoPathFollowing();
        const logoAttraction = this.logoAttraction(frameCount);

        const normalForces = new Vector2(
            alignment.x + cohesionForce.x + separationForce.x + gridForce.x + explosion.x + logoAttraction.x,
            alignment.y + cohesionForce.y + separationForce.y + gridForce.y + explosion.y + logoAttraction.y
        );

        const blendFactor = this.logoFollowing ? (1 - this.logoTransition) : 1;

        this.acceleration.x = normalForces.x * blendFactor + logoDirection.x * this.logoTransition;
        this.acceleration.y = normalForces.y * blendFactor + logoDirection.y * this.logoTransition;

        this.updateHue(neighbors);
    }

    updateHue(neighbors) {
        let targetHue = this.hue;

        if (ColorConfig.original.enabled) {
            targetHue = this.originalHueBlending(neighbors);
        }

        if (ColorConfig.echo.enabled) {
            this.addToColorMemory(this.hue);
            targetHue = this.applyEcho(targetHue);
        }

        this.hue = targetHue;
    }

    originalHueBlending(neighbors) {
        let totalHue = 0;
        let count = 0;

        for (const other of neighbors) {
            const distance = this.position.distance(other.position);
            if (other !== this && distance <= this.hueInfluenceRadius) {
                const hueDiff = ((other.hue - this.hue + 540) % 360) - 180;
                totalHue += this.hue + hueDiff;
                count++;
            }
        }

        if (count > 0) {
            const averageHue = totalHue / count;
            const hueDiff = ((averageHue - this.hue + 540) % 360) - 180;
            return (this.hue + hueDiff * ColorConfig.original.blendRate + 360) % 360;
        }
        return this.hue;
    }

    checkClique(allBoids, frameCount) {
        if (!ColorConfig.clique.enabled) return;

        if (ColorConfig.nixosLogo.enabled && this.isLogoActive(frameCount)) {
            return;
        }

        const similarBoids = this.findSimilarColorBoids(allBoids);

        if (similarBoids.length >= ColorConfig.clique.minSize) {
            this.cliqueTimer++;
            if (this.cliqueTimer >= ColorConfig.clique.timeThreshold) {
                const newHue = Math.random() * 360;
                const center = this.calculateCliqueCenter(similarBoids);

                for (const boid of similarBoids) {
                    boid.hue = newHue;
                    boid.cliqueTimer = 0;
                    boid.triggerExplosion(center);
                }
            }
        } else {
            this.cliqueTimer = 0;
        }
    }

    isLogoActive(frameCount) {
        const cyclePosition = frameCount % ColorConfig.nixosLogo.cycleLength;
        return cyclePosition < ColorConfig.nixosLogo.phaseInDuration + ColorConfig.nixosLogo.activeDuration + ColorConfig.nixosLogo.phaseOutDuration;
    }

    calculateCliqueCenter(boids) {
        let centerX = 0;
        let centerY = 0;
        for (const boid of boids) {
            centerX += boid.position.x;
            centerY += boid.position.y;
        }
        return new Vector2(centerX / boids.length, centerY / boids.length);
    }

    triggerExplosion(center) {
        const direction = this.position.subtract(center);
        const normalized = direction.magnitude() > 0 ? direction.normalize() : new Vector2(Math.random() - 0.5, Math.random() - 0.5).normalize();
        this.explosionDirection = normalized.multiply(ColorConfig.clique.explosionForce);
        this.explosionTimer = ColorConfig.clique.explosionDuration;
    }

    explosionForce() {
        if (this.explosionTimer <= 0) return new Vector2(0, 0);

        this.explosionTimer--;
        const decay = this.explosionTimer / ColorConfig.clique.explosionDuration;
        return this.explosionDirection.multiply(decay);
    }

    findSimilarColorBoids(allBoids) {
        const similar = [this];

        for (const other of allBoids) {
            if (other !== this) {
                const distance = this.position.distance(other.position);
                const colorDiff = Math.abs(((other.hue - this.hue + 540) % 360) - 180);

                if (distance <= ColorConfig.clique.proximityRadius &&
                    colorDiff <= ColorConfig.clique.colorTolerance) {
                    similar.push(other);
                }
            }
        }

        return similar;
    }

    applyEcho(currentHue) {
        if (this.colorMemory.length === 0) return currentHue;

        this.echoPhase += ColorConfig.echo.echoRate;
        const echoIndex = Math.floor(this.echoPhase) % this.colorMemory.length;
        const echoColor = this.colorMemory[echoIndex];

        const echoStrength = Math.sin(this.echoPhase * Math.PI) * ColorConfig.echo.decayRate;
        const hueDiff = ((echoColor - currentHue + 540) % 360) - 180;
        return (currentHue + hueDiff * echoStrength * 0.2 + 360) % 360;
    }

    update() {
        this.velocity = this.velocity.add(this.acceleration);
        this.velocity = this.velocity.limit(this.maxSpeed);
        this.position = this.position.add(this.velocity);
        this.acceleration = new Vector2(0, 0);
    }

    show(ctx) {
        const angle = Math.atan2(this.velocity.y, this.velocity.x);

        ctx.save();
        ctx.translate(this.position.x, this.position.y);
        ctx.rotate(angle);

        ctx.beginPath();
        ctx.moveTo(8, 0);
        ctx.lineTo(-8, -3);
        ctx.lineTo(-8, 3);
        ctx.closePath();

        ctx.fillStyle = `hsl(${this.hue}, 80%, 60%)`;
        ctx.fill();
        ctx.strokeStyle = `hsl(${this.hue}, 60%, 80%)`;
        ctx.lineWidth = 0.5;
        ctx.stroke();

        ctx.restore();
    }
}

class BoidsSimulation {
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.boids = [];
        this.spatialHash = new SpatialHash(50);
        this.frameCount = 0;

        this.setupCanvas();
        this.init();
        this.animate();
    }

    setupCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;

        ColorConfig.nixosLogo.centerX = this.canvas.width / 2;
        ColorConfig.nixosLogo.centerY = this.canvas.height / 2;

        window.addEventListener('resize', () => {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
            ColorConfig.nixosLogo.centerX = this.canvas.width / 2;
            ColorConfig.nixosLogo.centerY = this.canvas.height / 2;
        });
    }

    init() {
        const numBoids = 500;
        for (let i = 0; i < numBoids; i++) {
            const boid = new Boid(
                Math.random() * this.canvas.width,
                Math.random() * this.canvas.height
            );
            this.boids.push(boid);
        }
    }

    update() {
        this.frameCount++;
        this.spatialHash.clear();

        for (const boid of this.boids) {
            this.spatialHash.insert(boid);
        }

        for (const boid of this.boids) {
            boid.flock(this.spatialHash, this.frameCount);
            boid.update();
            boid.edges(this.canvas.width, this.canvas.height);
            boid.checkClique(this.boids, this.frameCount);
        }
    }

    draw() {
        this.ctx.fillStyle = 'rgba(74, 82, 90, 0.1)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        if (ColorConfig.nixosLogo.debugDraw) {
            this.drawLogo();
        }

        for (const boid of this.boids) {
            boid.show(this.ctx);
        }
    }

    drawLogo() {
        const config = ColorConfig.nixosLogo;
        if (!config.enabled) return;

        const centerX = config.centerX;
        const centerY = config.centerY;
        const scale = config.scale;

        for (let polyIndex = 0; polyIndex < NixOSLogoPolygons.length; polyIndex++) {
            const polygon = NixOSLogoPolygons[polyIndex];

            this.ctx.strokeStyle = `hsl(${polyIndex * 60}, 70%, 60%)`;
            this.ctx.lineWidth = 2;
            this.ctx.fillStyle = `hsla(${polyIndex * 60}, 50%, 50%, 0.1)`;

            this.ctx.beginPath();
            let isFirstPoint = true;
            for (const point of polygon) {
                const x = centerX + point[0] * scale;
                const y = centerY + point[1] * scale;

                if (isFirstPoint) {
                    this.ctx.moveTo(x, y);
                    isFirstPoint = false;
                } else {
                    this.ctx.lineTo(x, y);
                }
            }
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.stroke();
        }

        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        for (let i = 0; i < NixOSLogoSegments.length; i++) {
            const segment = NixOSLogoSegments[i];
            const startX = centerX + segment.start[0] * scale;
            const startY = centerY + segment.start[1] * scale;
            const endX = centerX + segment.end[0] * scale;
            const endY = centerY + segment.end[1] * scale;

            const midX = (startX + endX) / 2;
            const midY = (startY + endY) / 2;

            this.ctx.beginPath();
            this.ctx.arc(midX, midY, 2, 0, Math.PI * 2);
            this.ctx.fill();

            this.ctx.fillStyle = 'white';
            this.ctx.font = '10px monospace';
            this.ctx.fillText(i, midX + 3, midY - 3);
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        }

        this.ctx.strokeStyle = 'rgba(255, 100, 100, 0.6)';
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([5, 5]);
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, config.captureRadius, 0, Math.PI * 2);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
    }

    animate() {
        this.update();
        this.draw();
        requestAnimationFrame(() => this.animate());
    }
}

window.addEventListener('load', () => {
    new BoidsSimulation();
});
