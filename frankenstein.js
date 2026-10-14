// Frankenstein: A joint-based 2D puppet system.
// Each instance has 10 body parts (head, body, arms, legs) connected in a tree
// rooted at the head. Parts are positioned via CSS transforms based on joint data.

class Frankenstein {
    constructor() {
        // The container div, positioned at the top-center of the head.
        this.container = document.createElement("div");
        this.container.style.position = "absolute";
        this.container.style.transformOrigin = "top center";

        // Part names in order
        this.partNames = [
            "head", "body",
            "arm1", "arm1_mirror", "arm2", "arm2_mirror",
            "leg1", "leg1_mirror", "leg2", "leg2_mirror"
        ];

        // Default tree structure: intuitive human body hierarchy
        this.parentMap = {
            "head": null,           // root
            "body": "head",
            "arm1": "body",
            "arm1_mirror": "body",
            "arm2": "arm1",
            "arm2_mirror": "arm1_mirror",
            "leg1": "body",
            "leg1_mirror": "body",
            "leg2": "leg1",
            "leg2_mirror": "leg1_mirror"
        };

        // Each part: {elem: HTMLElement, img: string, config: object, type: string, deg: function}
        this.parts = {};
        for (const name of this.partNames) {
            const elem = document.createElement("div");
            elem.style.position = "absolute";
            elem.style.backgroundSize = "contain";
            elem.style.backgroundRepeat = "no-repeat";
            elem.style.pointerEvents = "none";
            this.container.appendChild(elem);

            this.parts[name] = {
                elem: elem,
                img: null,
                config: null,          // JSON with all joint positions on this part
                type: "absolute",      // rotation type: "absolute" or "relative"
                deg: () => 0,          // rotation function
                translateType: "relative", // translation type: "absolute", "relative", "rotate"
                translateX: () => 0,   // translation X function
                translateY: () => 0,   // translation Y function
                scale: () => 1,        // individual part scale
                naturalWidth: 0,
                naturalHeight: 0
            };
        }

        // Cache of computed absolute positions/rotations for each part
        this.cache = {};

        // Debug mode: show joint markers
        this.debugMode = false;
        this.debugMarkers = [];

        // Global scale function
        this.globalScale = () => 1;
    }

    // Override the default parent for a part (call before update())
    setParent(partName, parentName) {
        if (partName === "head") throw new Error("head is the root and cannot have a parent");
        if (!this.parts[partName]) throw new Error("Unknown part: " + partName);
        if (parentName !== null && !this.parts[parentName]) throw new Error("Unknown parent: " + parentName);
        this.parentMap[partName] = parentName;
    }

    // Load image and config JSON for a part
    // configData: object like { "head": {"center": [x,y]}, "arm1": {"center": [x,y]}, ... }
    //   keys are names of connected parts (parent + children)
    async loadPart(partName, imgSrc, configPath) {
        if (!this.parts[partName]) throw new Error("Unknown part: " + partName);

        const part = this.parts[partName];
        part.img = imgSrc;

        // Load config JSON
        const response = await fetch(configPath);
        part.config = await response.json();

        // Set background image
        part.elem.style.backgroundImage = `url(${imgSrc})`;

        // Load image to get natural dimensions, then size the div
        const img = new Image();
        img.src = imgSrc;
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
        });
        part.elem.style.width = img.naturalWidth + "px";
        part.elem.style.height = img.naturalHeight + "px";
        part.naturalWidth = img.naturalWidth;
        part.naturalHeight = img.naturalHeight;
    }

    // Set rotation type and angle function for a part
    setRotation(partName, type, degFunction) {
        if (!this.parts[partName]) throw new Error("Unknown part: " + partName);
        if (partName === "head" && type === "relative") {
            throw new Error("head cannot have type='relative'");
        }
        this.parts[partName].type = type;
        this.parts[partName].deg = degFunction;
    }

    // Set translation for a part
    // type: "absolute" (relative to root), "relative" (relative to parent in root coords), "rotate" (relative to parent in parent's rotated coords)
    setTranslation(partName, type, xFunction, yFunction) {
        if (!this.parts[partName]) throw new Error("Unknown part: " + partName);
        this.parts[partName].translateType = type;
        this.parts[partName].translateX = xFunction;
        this.parts[partName].translateY = yFunction;
    }

    // Set scale for a part
    setScale(partName, scaleFunction) {
        if (!this.parts[partName]) throw new Error("Unknown part: " + partName);
        this.parts[partName].scale = scaleFunction;
    }

    // Set global scale for the entire Frankenstein
    setGlobalScale(scaleFunction) {
        this.globalScale = scaleFunction;
    }

    // Get the parent of a part from the tree structure
    getParent(partName) {
        return this.parentMap[partName];
    }

    // Compute absolute position and rotation for a part (recursive, cached)
    computeTransform(partName) {
        if (this.cache[partName]) return this.cache[partName];

        const part = this.parts[partName];
        if (!part.config) {
            // Not loaded yet, default to origin
            this.cache[partName] = { x: 0, y: 0, rotation: 0 };
            return this.cache[partName];
        }

        if (partName === "head") {
            // Head is the root, positioned at (0,0) with its rotation
            const rotation = part.deg();
            // Head's rotation center (where body connects to it)
            let rotCenterX = 0;
            let rotCenterY = 0;
            if (part.config && part.config["body"]) {
                rotCenterX = part.config["body"].center[0];
                rotCenterY = part.config["body"].center[1];
            }
            // Head translation (only absolute makes sense for root)
            const tx = part.translateX();
            const ty = part.translateY();
            this.cache[partName] = { x: tx, y: ty, rotation, rotCenterX, rotCenterY };
            return this.cache[partName];
        }

        // Find parent
        const parentName = this.getParent(partName);
        if (!parentName) {
            // Orphan part, treat as absolute at origin
            const rotation = part.type === "absolute" ? part.deg() : 0;
            this.cache[partName] = { x: 0, y: 0, rotation };
            return this.cache[partName];
        }

        const parent = this.parts[parentName];
        const parentTransform = this.computeTransform(parentName);

        // Joint on parent: where this child should attach (in parent's local coordinates)
        const jointOnParent = parent.config[partName];
        if (!jointOnParent) {
            // Parent config doesn't define this joint, fallback to parent position
            const rotation = part.type === "absolute" ? part.deg() : parentTransform.rotation;
            this.cache[partName] = { x: parentTransform.x, y: parentTransform.y, rotation };
            return this.cache[partName];
        }

        // Joint on self: this part's rotation center (in this part's local coordinates)
        const jointOnSelf = part.config[parentName];
        if (!jointOnSelf) {
            // This part's config doesn't define its own rotation center, fallback
            console.warn(`${partName}.config["${parentName}"] not found. Config keys:`, Object.keys(part.config));
            const rotation = part.type === "absolute" ? part.deg() : parentTransform.rotation;
            this.cache[partName] = { x: parentTransform.x, y: parentTransform.y, rotation };
            return this.cache[partName];
        }

        // Compute rotation
        let rotation;
        if (part.type === "absolute") {
            rotation = part.deg();
        } else { // relative
            rotation = parentTransform.rotation + part.deg();
        }

        // Parent's attachment point in world space
        const parentJointX = jointOnParent.center[0];
        const parentJointY = jointOnParent.center[1];

        // Transform parent's attachment point to world space
        // Parent rotates around parentRotCenter, so we need to:
        // 1. Translate joint relative to rotation center
        // 2. Rotate it
        // 3. Translate back and add parent's world position
        const parentRotCenterX = parentTransform.rotCenterX || 0;
        const parentRotCenterY = parentTransform.rotCenterY || 0;

        const cosP = Math.cos(parentTransform.rotation * Math.PI / 180);
        const sinP = Math.sin(parentTransform.rotation * Math.PI / 180);

        // Joint position relative to rotation center
        const relJointX = parentJointX - parentRotCenterX;
        const relJointY = parentJointY - parentRotCenterY;

        // Rotate around origin
        const rotatedJointX = relJointX * cosP - relJointY * sinP;
        const rotatedJointY = relJointX * sinP + relJointY * cosP;

        // Add back rotation center and parent's world position
        const worldJointX = parentTransform.x + parentRotCenterX + rotatedJointX;
        const worldJointY = parentTransform.y + parentRotCenterY + rotatedJointY;

        // This part's rotation center
        const selfRotCenterX = jointOnSelf.center[0];
        const selfRotCenterY = jointOnSelf.center[1];

        // Position this part so its rotation center lands at the parent's attachment point
        let x = worldJointX - selfRotCenterX;
        let y = worldJointY - selfRotCenterY;

        // Apply translation
        const tx = part.translateX();
        const ty = part.translateY();
        if (part.translateType === "absolute") {
            // Absolute: offset relative to root (head)
            x += tx;
            y += ty;
        } else if (part.translateType === "relative") {
            // Relative: offset relative to parent in root coordinates (not affected by parent rotation)
            x += tx;
            y += ty;
        } else if (part.translateType === "rotate") {
            // Rotate: offset relative to parent in parent's rotated coordinates
            const cosP = Math.cos(parentTransform.rotation * Math.PI / 180);
            const sinP = Math.sin(parentTransform.rotation * Math.PI / 180);
            const rotatedTX = tx * cosP - ty * sinP;
            const rotatedTY = tx * sinP + ty * cosP;
            x += rotatedTX;
            y += rotatedTY;
        }

        this.cache[partName] = { x, y, rotation, rotCenterX: selfRotCenterX, rotCenterY: selfRotCenterY };
        return this.cache[partName];
    }

    // Update all part positions based on current rotation functions
    update() {
        // Clear cache
        this.cache = {};

        // Remove old debug markers
        if (this.debugMode) {
            for (const marker of this.debugMarkers) {
                if (marker.parentNode) marker.parentNode.removeChild(marker);
            }
            this.debugMarkers = [];
        }

        // Get global scale
        const gScale = this.globalScale();

        // Compute and apply transforms for each part
        for (const name of this.partNames) {
            const transform = this.computeTransform(name);
            const elem = this.parts[name].elem;
            const part = this.parts[name];

            // Each part rotates around its own rotation center
            const rotCenterX = transform.rotCenterX || 0;
            const rotCenterY = transform.rotCenterY || 0;

            // Apply global scale to position
            const scaledX = transform.x * gScale;
            const scaledY = transform.y * gScale;
            const scaledRotCenterX = rotCenterX * gScale;
            const scaledRotCenterY = rotCenterY * gScale;

            // Part's individual scale combined with global scale
            const partScale = part.scale();
            const totalScale = gScale * partScale;

            elem.style.transformOrigin = `${scaledRotCenterX}px ${scaledRotCenterY}px`;
            elem.style.transform = `translate(${scaledX}px, ${scaledY}px) rotate(${transform.rotation}deg) scale(${totalScale})`;

            // Debug markers
            if (this.debugMode && part.config) {
                // Show this part's rotation center in world space
                const cos = Math.cos(transform.rotation * Math.PI / 180);
                const sin = Math.sin(transform.rotation * Math.PI / 180);
                const worldRotCenterX = scaledX + scaledRotCenterX;
                const worldRotCenterY = scaledY + scaledRotCenterY;
                this.addDebugMarker(worldRotCenterX, worldRotCenterY, "red", name + " rot center");

                if (name === "head" || name === "body") {
                    console.log(name, "transform:", transform, "rotCenter:", rotCenterX, rotCenterY);
                    console.log(name, "config:", part.config);
                }

                // Show all joints defined on this part
                for (const [jointName, jointData] of Object.entries(part.config)) {
                    if (jointData.center) {
                        const localX = jointData.center[0] * gScale;
                        const localY = jointData.center[1] * gScale;
                        // Transform to world space
                        const relX = localX - scaledRotCenterX;
                        const relY = localY - scaledRotCenterY;
                        const worldX = worldRotCenterX + (relX * cos - relY * sin);
                        const worldY = worldRotCenterY + (relX * sin + relY * cos);

                        const color = jointName === this.getParent(name) ? "lime" : "cyan";
                        const label = name + " → " + jointName;
                        this.addDebugMarker(worldX, worldY, color, label);
                    }
                }
            }
        }
    }

    // Attach this Frankenstein to a DOM element
    attachTo(parentElement) {
        parentElement.appendChild(this.container);
    }

    // Set the position of the Frankenstein (top-center of head)
    setPosition(x, y) {
        this.container.style.left = x + "px";
        this.container.style.top = y + "px";
    }

    // Get the container DOM element (top-level div holding all parts)
    getContainer() {
        return this.container;
    }

    // Get a part's DOM element by name
    getElement(partName) {
        if (!this.parts[partName]) throw new Error("Unknown part: " + partName);
        return this.parts[partName].elem;
    }

    // Get a part object by name (includes elem, config, type, deg, translate, scale, etc.)
    getPart(partName) {
        if (!this.parts[partName]) throw new Error("Unknown part: " + partName);
        return this.parts[partName];
    }

    // Get all parts object (keyed by part name)
    getAllParts() {
        return this.parts;
    }

    // Enable/disable debug mode (shows joint markers)
    setDebugMode(enabled) {
        this.debugMode = enabled;
        if (!enabled) {
            // Remove all markers
            for (const marker of this.debugMarkers) {
                if (marker.parentNode) marker.parentNode.removeChild(marker);
            }
            this.debugMarkers = [];
        }
    }

    // Add a debug marker at a world position
    addDebugMarker(worldX, worldY, color, label) {
        const marker = document.createElement("div");
        marker.style.position = "absolute";
        marker.style.left = (worldX - 5) + "px";
        marker.style.top = (worldY - 5) + "px";
        marker.style.width = "10px";
        marker.style.height = "10px";
        marker.style.borderRadius = "50%";
        marker.style.backgroundColor = color;
        marker.style.border = "2px solid white";
        marker.style.pointerEvents = "none";
        marker.style.zIndex = "10000";
        if (label) {
            marker.title = label;
            const text = document.createElement("div");
            text.textContent = label;
            text.style.position = "absolute";
            text.style.left = "12px";
            text.style.top = "-2px";
            text.style.fontSize = "10px";
            text.style.color = "white";
            text.style.textShadow = "1px 1px 2px black";
            text.style.whiteSpace = "nowrap";
            marker.appendChild(text);
        }
        this.container.appendChild(marker);
        this.debugMarkers.push(marker);
    }
}