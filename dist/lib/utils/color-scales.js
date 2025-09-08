import { interpolateHsl, color } from 'd3';
import { noInterpolation, interpolateLinear, interpolate2DHermite } from './interpolations';
function interpolateColorScaleHSL(colors, steps) {
    const segments = colors.length - 1;
    const stepsPerSegment = Math.floor(steps / segments);
    const remainder = steps % segments;
    const rgbArray = [];
    for (let i = 0; i < segments; i++) {
        const startColor = colors[i];
        const endColor = colors[i + 1];
        const interpolate = interpolateHsl(startColor, endColor);
        const numSteps = stepsPerSegment + (i < remainder ? 1 : 0);
        for (let j = 0; j < numSteps; j++) {
            const t = j / (numSteps - 1); // range [0, 1]
            let c = color(interpolate(t));
            if (c) {
                c = c.rgb();
                rgbArray.push([c.r, c.g, c.b]);
            }
        }
    }
    return rgbArray;
}
const precipScale = {
    min: 0,
    max: 20,
    scalefactor: 1,
    colors: [
        ...interpolateColorScaleHSL(['blue', 'green'], 5), // 0 to 5mm
        ...interpolateColorScaleHSL(['green', 'orange'], 5), // 5 to 10mm
        ...interpolateColorScaleHSL(['orange', 'red'], 10) // 10 to 20mm
    ],
    interpolationMethod: 'linear',
    unit: 'mm'
};
const convectiveCloudScale = {
    min: 0,
    max: 6000,
    scalefactor: 1,
    colors: [
        ...interpolateColorScaleHSL(['#c0392b', '#d35400', '#f1c40f', '#16a085', '#2980b9'], 6000)
    ],
    interpolationMethod: 'none',
    unit: 'm'
};
export const colorScales = {
    cape: {
        min: 0,
        max: 4000,
        scalefactor: 1,
        colors: [
            ...interpolateColorScaleHSL(['#009392', '#39b185', '#9ccb86', '#e9e29c', '#eeb479', '#e88471', '#cf597e'], 4000)
        ],
        interpolationMethod: 'linear',
        unit: ''
    },
    cloud: {
        min: 0,
        max: 100,
        scalefactor: 1,
        colors: [
            ...interpolateColorScaleHSL(['#FFF', '#c3c2c2'], 100) // 0 to 100%
        ],
        interpolationMethod: 'linear',
        unit: '%'
    },
    convective_cloud_top: convectiveCloudScale,
    convective_cloud_base: convectiveCloudScale,
    precipitation: precipScale,
    pressure: {
        min: 950,
        max: 1050,
        scalefactor: 2,
        colors: [
            ...interpolateColorScaleHSL(['#4444FF', '#FFFFFF'], 25), // 950 to 1000hPa
            ...interpolateColorScaleHSL(['#FFFFFF', '#FF4444'], 25) // 1000hPa to 1050hPa
        ],
        interpolationMethod: 'linear',
        unit: 'hPa'
    },
    rain: precipScale,
    relative: {
        min: 0,
        max: 100,
        scalefactor: 1,
        colors: [
            ...interpolateColorScaleHSL(['#009392', '#39b185', '#9ccb86', '#e9e29c', '#eeb479', '#e88471', '#cf597e'].reverse(), 100)
        ],
        interpolationMethod: 'linear',
        unit: '%'
    },
    shortwave: {
        min: 0,
        max: 1000,
        scalefactor: 1,
        colors: [
            ...interpolateColorScaleHSL(['#009392', '#39b185', '#9ccb86', '#e9e29c', '#eeb479', '#e88471', '#cf597e'], 1000)
        ],
        interpolationMethod: 'linear',
        unit: 'W/m^2'
    },
    temperature: {
        min: -40,
        max: 60,
        scalefactor: 1,
        colors: [
            ...interpolateColorScaleHSL(['purple', 'blue'], 40), // -40° to 0°
            ...interpolateColorScaleHSL(['blue', 'green'], 16), // 0° to 16°
            ...interpolateColorScaleHSL(['green', 'orange'], 12), // 0° to 28°
            ...interpolateColorScaleHSL(['orange', 'red'], 14), // 28° to 42°
            ...interpolateColorScaleHSL(['red', 'purple'], 18) // 42° to 60°
        ],
        interpolationMethod: 'linear',
        unit: 'C°'
    },
    thunderstorm: {
        min: 0,
        max: 100,
        scalefactor: 1,
        colors: [
            ...interpolateColorScaleHSL(['blue', 'green'], 33), //
            ...interpolateColorScaleHSL(['green', 'orange'], 33), //
            ...interpolateColorScaleHSL(['orange', 'red'], 34) //
        ],
        interpolationMethod: 'linear',
        unit: '%'
    },
    uv: {
        min: 0,
        max: 12,
        scalefactor: 1,
        colors: [
            ...interpolateColorScaleHSL(['#009392', '#39b185', '#9ccb86', '#e9e29c', '#eeb479', '#e88471', '#cf597e'], 12)
        ],
        interpolationMethod: 'linear',
        unit: ''
    },
    wind: {
        min: 0,
        max: 40,
        scalefactor: 1,
       // 0–40 m/s (≈ 0–78 kt), interpolation HSL calquée sur l’ancienne palette CSS
        colors: [
        // 0–2.5 m/s (0–5 kt): blanc → cyan très pâle
        ...interpolateColorScaleHSL(['hsl(0,0%,100%)', 'hsl(185,60%,88%)'], 2),
        // 2.5–5 m/s (6–10 kt): cyan → vert
        ...interpolateColorScaleHSL(['hsl(185,60%,88%)', 'hsl(140,85%,50%)'], 2),
        // 5–10 m/s (11–20 kt): vert → jaune
        ...interpolateColorScaleHSL(['hsl(140,85%,50%)', 'hsl(60,100%,55%)'], 2),
        // 10–15 m/s (21–30 kt): jaune → orange
        ...interpolateColorScaleHSL(['hsl(60,100%,55%)', 'hsl(35,100%,55%)'], 4),
        // 15–20 m/s (31–40 kt): orange → magenta
        ...interpolateColorScaleHSL(['hsl(35,100%,55%)', 'hsl(325,100%,55%)'], 10),
        // 20–30 m/s (41–60 kt): magenta → violet
        ...interpolateColorScaleHSL(['hsl(325,100%,55%)', 'hsl(270,100%,60%)'], 10),
        // 30–40 m/s (61–78 kt): violet → bleu
        ...interpolateColorScaleHSL(['hsl(270,100%,60%)', 'hsl(225,100%,60%)'], 10)
        ],
        interpolationMethod: 'linear',
        unit: 'm/s'
    }
};
export function getColorScale(variable) {
    return (colorScales[variable.value] ??
        colorScales[variable.value.split('_')[0]] ??
        colorScales['temperature']);
}
export function getInterpolator(colorScale) {
    if (!colorScale.interpolationMethod || colorScale.interpolationMethod === 'none') {
        return noInterpolation;
    }
    else if (colorScale.interpolationMethod === 'linear') {
        return interpolateLinear;
    }
    else if (colorScale.interpolationMethod === 'hermite2d') {
        return interpolate2DHermite;
    }
    else {
        // default is linear
        return interpolateLinear;
    }
}
