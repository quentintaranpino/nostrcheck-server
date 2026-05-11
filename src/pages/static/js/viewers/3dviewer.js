async function init3dViewer (canvasId, containerId, url, width = "", height = "") {

    const container = document.getElementById(containerId);
    const canvas = document.getElementById(canvasId);
    if (!canvas || !container) return;

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

    try {
        const buf = await (await fetch(url)).arrayBuffer();
        const geometry = new THREE.STLLoader().parse(buf);
        const material = new THREE.MeshPhongMaterial({ color: 0x555555, specular: 0x111111, shininess: 200 });
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
        console.error("init3dViewer - failed to load STL:", e);
        return;
    }

    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
    }
    animate();

    // Keep the canvas in sync with container resize (modal opening, fullscreen toggle, etc).
    const ro = new ResizeObserver(() => {
        const nw = container.clientWidth || w;
        const nh = container.clientHeight || h;
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
        renderer.setSize(nw, nh, false);
    });
    ro.observe(container);
}
