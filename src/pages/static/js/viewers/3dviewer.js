window.__failedStlUrls = window.__failedStlUrls || new Set();

async function init3dViewer (canvasId, containerId, url, width = "", height = "") {

    const container = document.getElementById(containerId);
    const canvas = document.getElementById(canvasId);
    if (!canvas || !container) return;
    if (window.__failedStlUrls.has(url)) return; // avoid re-fetching a blob that already failed parse

    const w = Number(width) || container.clientWidth || 400;
    const h = Number(height) || container.clientHeight || 400;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 10000);
    const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setClearColor(0xCFCFCF);
    renderer.setSize(w, h, false);

    scene.add(new THREE.AmbientLight(0x404040, 1));
    const dir = new THREE.DirectionalLight(0xffffff, 1);
    dir.position.set(1, 1, 1).normalize();
    scene.add(dir);
    const point = new THREE.PointLight(0xffffff, 0.5);
    camera.add(point);
    scene.add(camera);

    const controls = new THREE.OrbitControls(camera, renderer.domElement);

    let rafId = null;
    let ro = null;
    let geometry = null;
    let material = null;

    const cleanup = () => {
        if (rafId !== null) cancelAnimationFrame(rafId);
        rafId = null;
        if (ro) { ro.disconnect(); ro = null; }
        if (controls && controls.dispose) controls.dispose();
        if (geometry && geometry.dispose) geometry.dispose();
        if (material && material.dispose) material.dispose();
        if (renderer && renderer.dispose) renderer.dispose();
    };

    try {
        const buf = await (await fetch(url)).arrayBuffer();
        const u8 = new Uint8Array(buf);

        // STLLoader 0.128 doesn't validate the binary triangle count and
        // blows up with RangeError on ASCII / corrupt / non-STL files
        // (e.g. an HTML challenge page from Cloudflare). Decide the format
        // ourselves and refuse anything that isn't STL.
        const head = u8.length >= 5 ? new TextDecoder().decode(u8.subarray(0, 5)) : "";
        let asAscii = false;
        let validBinary = false;
        if (buf.byteLength > 84) {
            const triCount = new DataView(buf).getUint32(80, true);
            validBinary = 84 + triCount * 50 === buf.byteLength;
        }
        if (head === "solid" && !validBinary) {
            asAscii = true;
        } else if (!validBinary) {
            throw new Error(`Not a valid STL (${buf.byteLength} bytes, header "${head}")`);
        }

        const loader = new THREE.STLLoader();
        geometry = asAscii
            ? loader.parse(new TextDecoder().decode(u8))
            : loader.parse(buf);
        material = new THREE.MeshPhongMaterial({ color: 0x555555, specular: 0x111111, shininess: 200 });
        const mesh = new THREE.Mesh(geometry, material);

        // Frame the camera around the model regardless of its scale.
        geometry.computeBoundingBox();
        const box = geometry.boundingBox;
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        mesh.position.sub(center);
        mesh.rotation.x = -Math.PI / 4;
        scene.add(mesh);

        const dist = maxDim * 2.2;
        camera.position.set(dist, dist, dist);
        camera.lookAt(0, 0, 0);
        controls.target.set(0, 0, 0);
        controls.update();
    } catch (e) {
        window.__failedStlUrls.add(url);
        // Expected for files mislabeled as .stl; the viewer rejects them safely.
        console.debug("init3dViewer - rejected non-STL blob:", e?.message || e);
        cleanup();
        return;
    }

    function animate() {
        // Tile recycled or modal closed -> drop the GPU context so we don't
        // leak animation loops + WebGL programs across renderers (causes
        // "uniform3fv: location is not from the associated program").
        if (!canvas.isConnected) {
            cleanup();
            return;
        }
        rafId = requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
    }
    rafId = requestAnimationFrame(animate);

    // Keep the canvas in sync with container resize (modal opening, fullscreen toggle, etc).
    ro = new ResizeObserver(() => {
        const nw = container.clientWidth || w;
        const nh = container.clientHeight || h;
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
        renderer.setSize(nw, nh, false);
    });
    ro.observe(container);
}
