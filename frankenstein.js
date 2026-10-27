// Frankenstein: A joint-based 2D puppet system.
//
// A puppet is a set of named body parts in a tree, rooted at whichever part has no
// parent. Each part is a DOM element -- one you hand over, or a div this class builds
// around a background image -- and its place in the world is computed from the joints
// that tie it to its neighbours.
//
//     const f = new Frankenstein();
//     f.addPart("torso", document.getElementById("torso"));
//     f.addPart("arm", { element: myArmNode, parent: "torso" });
//     f.setJoint("torso", "arm", "50%", "20%");   // where the arm sockets into the torso
//     f.setJoint("arm", "torso", 20, 0);          // ...and the same joint on the arm
//     f.attachTo(document.body);
//     f.update();
//
// A joint is written down TWICE, once on each part, because the two parts disagree about
// where it is: each side states it in its own local pixel space. Both sides must land on
// the same point on screen -- that is the invariant the whole system rests on.
//
// `new Frankenstein()` builds nothing at all: a rig's cast is the caller's to decide.
// For the ten-part humanoid the prestige layer uses, call Frankenstein.humanoid().

class Frankenstein {
    constructor() {
        // The container div holding every part.
        this.container = document.createElement("div");
        this.container.style.position = "absolute";
        this.container.style.transformOrigin = "top center";

        // Parts and the tree, both filled in by addPart() / loadPart() / humanoid().
        this.parts = {};
        this.parentMap = {};

        // Cache of computed absolute positions/rotations for each part
        this.cache = {};

        // Debug mode: show joint markers
        this.debugMode = false;
        this.debugMarkers = [];

        // Global scale function
        this.globalScale = () => 1;

        // In-flight image loads, awaited by ready()
        this.loads = [];
    }

    // The part names, in the order they were added -- which is also the order they are
    // updated and painted in (later parts are appended later, so they sit on top).
    // Derived from `parts` rather than kept alongside it, so the two cannot disagree.
    get partNames() {
        return Object.keys(this.parts);
    }

    // Add a body part.
    //
    //     addPart("arm", someElement)                    // this node IS the part
    //     addPart("arm", { element: someElement, parent: "torso" })
    //     addPart("arm", { image: "pics/arm1.png", joints: { body: [199, 38] } })
    //     addPart("arm", { width: 238, height: 76, parent: "torso" })   // a bare div
    //
    // spec fields, all optional:
    //     element   a DOM node to adopt as this part
    //     image     a background image URL, for a div built here
    //     joints    a joint table, the same shape as a pics/*.png.json file
    //     parent    the name of the part this one hangs off; omit for a root
    //     width / height   this part's own box, which its relative joints measure against
    //     style     CSS applied to the element last, as an object
    //
    // With neither element nor image a plain div is built, so a rig needs no artwork at
    // all -- only joints. A part may only be parented to a part that already exists, so
    // a rig is declared parents-first.
    addPart(name, spec) {
        if (this.parts[name]) throw new Error("Part already exists: " + name);

        // A bare DOM node is shorthand for { element: node }.
        if (spec && typeof spec.appendChild === "function") spec = { element: spec };
        spec = spec || {};

        if (spec.parent !== undefined && spec.parent !== null && !this.parts[spec.parent]) {
            throw new Error("addPart(" + name + "): no part called " + JSON.stringify(spec.parent) +
                            " to hang it off yet -- add a part before the parts below it, or " +
                            "rearrange the tree afterwards with setParent().");
        }

        const elem = spec.element || document.createElement("div");

        // Adoption. The element has to live in the container to be in the rig's
        // coordinate space, and appendChild moves it there if it was somewhere else.
        this.container.appendChild(elem);

        // The two styles the rig itself depends on: absolute, so the transform is the
        // whole story about where the part is, and no pointer events, so a part never
        // swallows a click meant for the game. Everything else about an element you
        // supplied is left alone -- in particular it is never given a background image,
        // and its own background size/repeat are none of our business.
        elem.style.position = "absolute";
        elem.style.pointerEvents = "none";

        if (!spec.element) {
            // A div built here is a picture frame, so it gets the frame's settings.
            elem.style.backgroundSize = "contain";
            elem.style.backgroundRepeat = "no-repeat";
        }

        this.parts[name] = {
            elem: elem,
            img: null,
            config: null,              // joint table: { "<other part>": { center: [x, y] } }
            type: "absolute",          // rotation type: "absolute" or "relative"
            deg: () => 0,              // rotation function
            translateType: "relative", // translation type: "absolute", "relative", "rotate"
            translateX: () => 0,       // translation X function
            translateY: () => 0,       // translation Y function
            scale: () => 1,            // individual part scale
            naturalWidth: 0,           // this part's own box, which "50%" is a fraction of
            naturalHeight: 0,
            warned: {}                 // so each complaint about this part is made once
        };
        this.parentMap[name] = spec.parent || null;

        if (spec.joints) this.setJoints(name, spec.joints);
        if (spec.image) this._loadImage(name, spec.image, spec);
        // An explicit box wins over a measurement. Otherwise measure what was just
        // appended, before update() has given it a transform of its own: a rect folds
        // the element's transform in -- here and in a browser -- so measuring after the
        // first update() would be measuring the wrong box.
        else if (spec.width !== undefined || spec.height !== undefined) this.setPartSize(name, spec.width, spec.height);
        else this.measurePart(name);

        // Last, so a caller's own styling can override the rig's.
        if (spec.style) {
            for (const key of Object.keys(spec.style)) {
                elem.style[Frankenstein.cssProp(key)] = spec.style[key];
            }
        }

        return this.parts[name];
    }

    // Take a part out of the rig. Its children are spliced up to its own parent, so
    // nothing is ever left pointing at a part that is no longer there; the children of a
    // removed root become roots themselves.
    removePart(partName) {
        const part = this.parts[partName];
        if (!part) throw new Error("Unknown part: " + partName);

        const parent = this.parentMap[partName];
        for (const name of this.partNames) {
            if (this.parentMap[name] === partName) this.parentMap[name] = parent;
        }
        delete this.parentMap[partName];
        delete this.parts[partName];
        delete this.cache[partName];

        if (part.elem.parentNode) part.elem.parentNode.removeChild(part.elem);
        return part;
    }

    // State a part's own box outright. A relative joint is a fraction of this, and the
    // element's width/height are set to match, because a box the caller stated is a box
    // the caller meant.
    setPartSize(partName, width, height) {
        const part = this.parts[partName];
        if (!part) throw new Error("Unknown part: " + partName);
        if (width !== undefined && width !== null) {
            part.naturalWidth = width;
            part.elem.style.width = width + "px";
        }
        if (height !== undefined && height !== null) {
            part.naturalHeight = height;
            part.elem.style.height = height + "px";
        }
        return part;
    }

    // Read a part's box off its element instead of being told it. Only meaningful while
    // the element is actually laid out: one inside a display:none layer measures 0x0,
    // and a relative joint then resolves against that. setPartSize() is the way out.
    measurePart(partName) {
        const part = this.parts[partName];
        if (!part) throw new Error("Unknown part: " + partName);
        const rect = part.elem.getBoundingClientRect();
        part.naturalWidth = rect.width || parseFloat(part.elem.style.width) || 0;
        part.naturalHeight = rect.height || parseFloat(part.elem.style.height) || 0;
        return part;
    }

    // Await every image load started so far, so a caller can be sure the parts have
    // their pictures (and their intrinsic sizes) before asking for a frame.
    async ready() {
        while (this.loads.length) {
            const pending = this.loads;
            this.loads = [];
            await Promise.all(pending);
        }
    }

    // The part a tree hangs from: the first part with no parent, or null in an empty rig.
    getRoot() {
        for (const name of this.partNames) {
            if (this.parentMap[name] === null) return name;
        }
        return null;
    }

    // Put a part somewhere else in the tree (call before update()).
    //
    // A part cannot descend from itself, so the walk up from the proposed parent is the
    // real check here -- "head is the root" was only ever a special case of it. A null
    // parent makes the part a root, which is how a rig ends up with more than one tree.
    setParent(partName, parentName) {
        if (!this.parts[partName]) throw new Error("Unknown part: " + partName);
        if (parentName !== null && parentName !== undefined && !this.parts[parentName]) {
            throw new Error("Unknown parent: " + parentName);
        }
        // The walk ends because the tree is acyclic, and the tree is acyclic because this
        // loop is the only thing that makes it otherwise: it refuses every move that would
        // close a cycle, so the chain of parents always runs out at a root.
        for (let at = parentName; at !== null && at !== undefined; at = this.parentMap[at]) {
            if (at === partName) {
                throw new Error("Cannot parent " + partName + " to " + parentName +
                                ": it is already an ancestor of it.");
            }
        }
        this.parentMap[partName] = (parentName === undefined) ? null : parentName;
    }

    // Give a part a background image and learn its intrinsic size. The load is registered
    // so ready() can wait on it; the promise is returned too.
    _loadImage(partName, imgSrc, spec) {
        const part = this.parts[partName];
        part.img = imgSrc;
        part.elem.style.backgroundImage = `url(${imgSrc})`;

        const img = new Image();
        img.src = imgSrc;
        const done = new Promise((resolve, reject) => {
            img.onload = () => {
                // A box the caller stated beats the picture's own size.
                if (!spec || (spec.width === undefined && spec.height === undefined)) {
                    part.elem.style.width = img.naturalWidth + "px";
                    part.elem.style.height = img.naturalHeight + "px";
                    part.naturalWidth = img.naturalWidth;
                    part.naturalHeight = img.naturalHeight;
                }
                resolve(part);
            };
            img.onerror = reject;
        });

        // One bad image should not sink a whole ready(); a caller awaiting loadPart()
        // itself still sees the rejection.
        this.loads.push(done.then(() => {}, () => {}));
        return done;
    }

    // Load an image and a joint file for a part, adding the part if it is not there yet.
    //
    // The file is the pics/*.png.json shape: keys are the names of the parts this one is
    // joined to -- its parent and its children -- and each gives the joint's position in
    // THIS part's own pixel space.
    async loadPart(partName, imgSrc, configPath) {
        if (!this.parts[partName]) this.addPart(partName, {});
        const part = this.parts[partName];

        // Load config JSON
        const response = await fetch(configPath);
        part.config = await response.json();

        await this._loadImage(partName, imgSrc);
        return part;
    }

    // Set rotation type and angle function for a part
    setRotation(partName, type, degFunction) {
        if (!this.parts[partName]) throw new Error("Unknown part: " + partName);
        // "relative" means "on top of my parent's rotation", and a root has no parent.
        if (this.getParent(partName) === null && type === "relative") {
            throw new Error(partName + " is a root and cannot have type='relative'");
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

    // ---------- joints ----------

    // A part's joint table: { "<other part>": { center: [x, y] } }, the same shape the
    // pics/*.png.json files have. Empty until something fills it in.
    getJoints(partName) {
        if (!this.parts[partName]) throw new Error("Unknown part: " + partName);
        return this.parts[partName].config || {};
    }

    getJoint(partName, otherName) {
        return this.getJoints(partName)[otherName] || null;
    }

    // State one joint on one part, no joint file needed.
    //
    //     setJoint("body", "arm1", 0, 80);          // pixels in body's own space
    //     setJoint("arm1", "body", "50%", "50%");   // the middle of arm1
    //     setJoint("arm1", "body", () => x, 38);    // recomputed every update()
    //
    // Each coordinate is a number, a "NN%" string measured against this part's own box,
    // or a function returning either. Something already in the table is replaced whole;
    // anything else in it is left alone, so this can adjust a file's joints rather than
    // only stand in for one.
    setJoint(partName, otherName, x, y) {
        const part = this.parts[partName];
        if (!part) throw new Error("Unknown part: " + partName);
        if (!part.config) part.config = {};

        // A whole entry can be handed over instead of the two coordinates -- that is how
        // a joint file's extra keys (radius, color) survive a round trip.
        if (x !== null && typeof x === "object" && y === undefined) {
            part.config[otherName] = x;
        } else {
            part.config[otherName] = { center: [x, y] };
        }
        return part.config[otherName];
    }

    // State a whole joint table at once, the way a joint file reads. Entries may be the
    // bare pair (arm1: [0, 80]) or the full object (arm1: { center: [0, 80] }).
    setJoints(partName, joints) {
        for (const otherName of Object.keys(joints)) {
            const entry = joints[otherName];
            if (Array.isArray(entry)) this.setJoint(partName, otherName, entry[0], entry[1]);
            else this.setJoint(partName, otherName, entry);
        }
        return this.getJoints(partName);
    }

    // Resolve one coordinate of a joint into pixels in `partName`'s OWN local space.
    //
    //     number    pixels, straight through
    //     "50%"     a fraction of this part's own box -- width for x, height for y
    //     function  called for its current value
    //
    // "Own" is the whole point. A joint is written down twice, once on each part, and
    // each side measures against itself: "50% 50%" on both sides of a joint says both
    // parts pivot about their own middle, which is the same thing today's pixel joints
    // say in pixels. Called from computeTransform, which runs once per update(), so a
    // function coordinate is recomputed every frame.
    resolveCoord(value, partName, axis) {
        const part = this.parts[partName];

        if (typeof value === "function") return this.resolveCoord(value(), partName, axis);

        if (typeof value === "string" && value.trim().slice(-1) === "%") {
            const box = axis === 0 ? part.naturalWidth : part.naturalHeight;
            if (!box && !part.warned["box:" + axis]) {
                part.warned["box:" + axis] = true;
                console.warn(`Frankenstein: ${partName}'s ${axis === 0 ? "width" : "height"} is 0, ` +
                             `so the relative joint ${JSON.stringify(value)} resolves to 0. Give ` +
                             `the part a width/height in addPart(), or call setPartSize().`);
            }
            return parseFloat(value) / 100 * (box || 0);
        }

        const n = parseFloat(value);
        return isFinite(n) ? n : 0;
    }

    // Resolve a joint's [x, y] pair in `partName`'s own local space.
    resolveJoint(center, partName) {
        return [this.resolveCoord(center[0], partName, 0),
                this.resolveCoord(center[1], partName, 1)];
    }

    // Where the rig hangs off a part: the joint toward its first child, in the part's own
    // space. [0, 0] when it has no children, or no joint to show for them.
    _firstChildJoint(partName) {
        const part = this.parts[partName];
        for (const name of this.partNames) {
            if (this.parentMap[name] === partName && part.config && part.config[name]) {
                return this.resolveJoint(part.config[name].center, partName);
            }
        }
        return [0, 0];
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

        // A part with no parent is the root of a tree. It sits at its own translation and
        // pivots on the joint toward its first child, which is where the rest of the rig
        // hangs off it. (This used to be spelled "the part named head" and "the joint
        // named body"; a rig is free to have neither.) A parent name that names nothing
        // is treated the same way rather than throwing mid-frame -- addPart() and
        // setParent() are where a broken tree gets caught.
        const parentName = this.getParent(partName);
        const parent = parentName ? this.parts[parentName] : null;

        if (!parent) {
            const rotation = part.type === "absolute" ? part.deg() : 0;
            const anchor = this._firstChildJoint(partName);
            this.cache[partName] = { x: part.translateX(), y: part.translateY(), rotation,
                                     rotCenterX: anchor[0], rotCenterY: anchor[1] };
            return this.cache[partName];
        }

        const parentTransform = this.computeTransform(parentName);

        // Joint on parent: where this child attaches, in the PARENT's own space.
        const jointOnParent = parent.config && parent.config[partName];
        if (!jointOnParent) {
            // Nothing on the parent says where this child attaches, so the child sits on
            // the parent's origin. Say so once: a joint declared on one side only looks
            // like a part that simply will not go where it was put.
            if (parent.config && !part.warned.parentJoint) {
                part.warned.parentJoint = true;
                console.warn(`Frankenstein: ${parentName}'s joints say nothing about ${partName}, ` +
                             `so it sits on ${parentName}'s origin. setJoint(${JSON.stringify(parentName)}, ` +
                             `${JSON.stringify(partName)}, x, y) is where that goes.`);
            }
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

        // Parent's attachment point, resolved in the PARENT's own space -- the parent is
        // the part this joint was written down on.
        const parentJoint = this.resolveJoint(jointOnParent.center, parentName);
        const parentJointX = parentJoint[0];
        const parentJointY = parentJoint[1];

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

        // This part's rotation center, resolved in THIS part's own space -- this joint
        // was written down on this part.
        const selfJoint = this.resolveJoint(jointOnSelf.center, partName);
        const selfRotCenterX = selfJoint[0];
        const selfRotCenterY = selfJoint[1];

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

        // The part the whole rig hangs from, for the debug log below.
        const root = this.getRoot();

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

            // transform-origin is measured in the element's OWN pixel space. The div
            // is sized to the image's natural pixels and the shrinking is done by
            // scale() in the transform, so the origin must be the raw joint pixel --
            // multiplying it by gScale puts the pivot somewhere inside the part
            // instead of on its joint (the head would spin about its middle rather
            // than its neck, the forearm about its middle rather than its elbow).
            const originX = rotCenterX;
            const originY = rotCenterY;

            // With the origin sitting on the joint, the joint is the fixed point of
            // the rotation, so it lands at translate + origin. Put it where the joint
            // belongs on screen: gScale * (part position + its own joint offset).
            const tx = gScale * (transform.x + rotCenterX) - rotCenterX;
            const ty = gScale * (transform.y + rotCenterY) - rotCenterY;

            elem.style.transformOrigin = `${originX}px ${originY}px`;
            elem.style.transform = `translate(${tx}px, ${ty}px) rotate(${transform.rotation}deg) scale(${totalScale})`;

            // Debug markers
            if (this.debugMode && part.config) {
                // Show this part's rotation center in world space
                const cos = Math.cos(transform.rotation * Math.PI / 180);
                const sin = Math.sin(transform.rotation * Math.PI / 180);
                const worldRotCenterX = scaledX + scaledRotCenterX;
                const worldRotCenterY = scaledY + scaledRotCenterY;
                this.addDebugMarker(worldRotCenterX, worldRotCenterY, "red", name + " rot center");

                if (name === root) {
                    console.log(name, "transform:", transform, "rotCenter:", rotCenterX, rotCenterY);
                    console.log(name, "config:", part.config);
                }

                // Show all joints defined on this part
                for (const [jointName, jointData] of Object.entries(part.config)) {
                    if (jointData.center) {
                        // Resolve before scaling: a coordinate may be a percentage of this
                        // part's own box, or a function, and neither multiplies.
                        const joint = this.resolveJoint(jointData.center, name);
                        const localX = joint[0] * gScale;
                        const localY = joint[1] * gScale;
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

// The rig the prestige layer uses: ten parts with the head at the root, listed
// parents-first and in the order they are painted (later parts on top).
Frankenstein.HUMANOID = [
    ["head", null],
    ["body", "head"],
    ["arm1", "body"],
    ["arm1_mirror", "body"],
    ["arm2", "arm1"],
    ["arm2_mirror", "arm1_mirror"],
    ["leg1", "body"],
    ["leg1_mirror", "body"],
    ["leg2", "leg1"],
    ["leg2_mirror", "leg1_mirror"]
];

// The ten-part humanoid, with no artwork attached yet -- loadPart() fills in the pictures
// and the joint files. The parts are created here rather than by loadPart() so that
// partNames, which is also the paint order, does not depend on the order ten images
// happen to finish loading in.
Frankenstein.humanoid = function () {
    const f = new Frankenstein();
    for (const [name, parent] of Frankenstein.HUMANOID) f.addPart(name, { parent });
    return f;
};

// "background-color" -> "backgroundColor". element.style only knows the camelCase
// spelling, so a kebab-case key in an addPart() style spec would be set on the element
// and then never seen by anything. A static rather than a top-level function because
// every script here shares one global scope.
Frankenstein.cssProp = function (key) {
    return key.indexOf("-") < 0 ? key : key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
};