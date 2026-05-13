const pre = document.getElementById('spinner');

// Geometry: NixOS Lambda-flake
let points = [];

// Brand Colors (Logo Default)
const C_DARK = "#4d6fb7";
const C_LIGHT = "#77b6e1";

function addLine(p1, p2, colorId) {
    let dx = p2.x - p1.x;
    let dy = p2.y - p1.y;
    let dz = p2.z - p1.z;
    let dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
    let steps = Math.floor(dist * 1.5); // Density
    for (let i=0; i<=steps; i++) {
        let t = i/steps;
        points.push({
            x: p1.x + dx*t,
            y: p1.y + dy*t,
            z: p1.z + dz*t,
            c: colorId
        });
    }
}

const numWedges = 6;
const depth = 2.0;

// Independent Lambda Rotation
let lambdaRotX = 0 * (Math.PI / 180);
let lambdaRotY = 180 * (Math.PI / 180);
let lambdaRotZ = 230 * (Math.PI / 180);

// Increase radius so inner legs don't overlap, and set outer for lighting
const rCenter = 14;
const rOuter = 24;

const strokeWidth = 2.5;

// Skeleton Points
const pInnerTop = { x: -1.5, y: 7 };
const pOuterLeft = { x: -5, y: -7 };
const pOuterRight = { x: 4, y: -7 };

// Geometry connection point
const pCrotch = { x: -3, y: 1 };

function makeQuad(Start, End, w) {
     let dx = End.x - Start.x;
     let dy = End.y - Start.y;
     let len = Math.sqrt(dx*dx + dy*dy);
     let nx = -dy / len * (w/2);
     let ny = dx / len * (w/2);

     return [
        { x: Start.x + nx, y: Start.y + ny },
        { x: End.x + nx,   y: End.y + ny },
        { x: End.x - nx,   y: End.y - ny },
        { x: Start.x - nx, y: Start.y - ny }
     ];
}

const spine = makeQuad(pInnerTop, pOuterLeft, strokeWidth);
const leg = makeQuad(pCrotch, pOuterRight, strokeWidth);

const shapePolys = [spine, leg];

for (let i = 0; i < numWedges; i++) {
    const angle = (i * 60) * Math.PI / 180;

    const transform = (p, z) => {
        let px = p.x;
        let py = p.y;
        let pz = z;

        if (lambdaRotX !== 0) {
            let c = Math.cos(lambdaRotX);
            let s = Math.sin(lambdaRotX);
            let tempY = py * c - pz * s;
            let tempZ = py * s + pz * c;
            py = tempY;
            pz = tempZ;
        }
        if (lambdaRotY !== 0) {
            let c = Math.cos(lambdaRotY);
            let s = Math.sin(lambdaRotY);
            let tempX = px * c - pz * s;
            let tempZ = px * s + pz * c;
            px = tempX;
            pz = tempZ;
        }
        if (lambdaRotZ !== 0) {
            let c = Math.cos(lambdaRotZ);
            let s = Math.sin(lambdaRotZ);
            let tempX = px * c - py * s;
            let tempY = px * s + py * c;
            px = tempX;
            py = tempY;
        }

        // Flip orientation (Head Out, Legs In)
        // We ADD p.y to radius instead of subtracting.
        // y=7 (Head) becomes (18 + 7) = 25 (Outer)
        // y=-7 (Legs) becomes (18 - 7) = 11 (Inner)
        const u = rCenter + py;
        const v = px;

        return {
            x: u * Math.cos(angle) - v * Math.sin(angle),
            y: u * Math.sin(angle) + v * Math.cos(angle),
            z: pz,
            c: i % 2 === 0 ? 0 : 1
        };
    };

    shapePolys.forEach(poly => {
        for (let j = 0; j < poly.length; j++) {
            const pStart = poly[j];
            const pEnd = poly[(j + 1) % poly.length];
            addLine(transform(pStart, -depth), transform(pEnd, -depth), i%2);
            addLine(transform(pStart, depth), transform(pEnd, depth), i%2);
            addLine(transform(pStart, -depth), transform(pStart, depth), i%2);
        }
    });
}

let angleX = 0;
let angleY = 0;

const width = 80;
const height = 40;

function render() {


    let zBuffer = new Array(height * width).fill(-Infinity);
    let charBuffer = new Array(height * width).fill(null);

    let cosY = Math.cos(angleY), sinY = Math.sin(angleY);
    let cosX = Math.cos(angleX), sinX = Math.sin(angleX);

    points.forEach(p => {
        let x1 = p.x * cosY - p.z * sinY;
        let z1 = p.x * sinY + p.z * cosY;
        let y2 = p.y * cosX - z1 * sinX;
        let z2 = p.y * sinX + z1 * cosX;

        let dist = 50;
        let ooz = 1 / (z2 + dist);

        let xp = Math.floor(width/2 + (x1 * ooz * 60 * 1));
        let yp = Math.floor(height/2 + (y2 * ooz * 30));

        if (xp >= 0 && xp < width && yp >= 0 && yp < height) {
            let idx = yp * width + xp;
            if (ooz > zBuffer[idx]) {
                zBuffer[idx] = ooz;
                let lum = (z2 + rOuter) / (rOuter * 2);
                let palette = ".:-=+*#%@";
                let charIdx = Math.floor(lum * palette.length);
                charIdx = Math.max(0, Math.min(palette.length-1, charIdx));

                charBuffer[idx] = {
                    char: palette[charIdx],
                    color: p.c === 0 ? C_DARK : C_LIGHT
                };
            }
        }
    });

    let html = "";
    for (let i = 0; i < height; i++) {
        for (let j = 0; j < width; j++) {
            let idx = i * width + j;
            let pixel = charBuffer[idx];
            if (!pixel) {
                html += " ";
            } else {
                html += `<span style="color:${pixel.color}">${pixel.char}</span>`;
            }
        }
        html += "\n";
    }
    pre.innerHTML = html;

    angleY += 0.03;
    angleX += 0.005;

    requestAnimationFrame(render);
}

render();
