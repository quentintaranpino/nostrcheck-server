async function init3dViewer (canvasId, containerId, url, width = "", height = "") {

    const container = document.getElementById(containerId);
    const canvas = document.getElementById(canvasId);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setClearColor(0xCFCFCF);
    renderer.setSize(width || container.clientWidth -40, height || container.clientHeight -40);

    const ambientLight = new THREE.AmbientLight(0x404040, 1); 
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(1, 1, 1).normalize();
    scene.add(directionalLight);

    const pointLight = new THREE.PointLight(0xffffff, 0.5);
    camera.add(pointLight); 
    scene.add(camera);

    camera.position.set(4, 4, 155);

    const controls = new THREE.OrbitControls(camera, renderer.domElement);

    await fetch(url)
    .then(res => res.blob())
    .then(blob => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const loader = new THREE.STLLoader();
            const geometry = loader.parse(e.target.result);
            const material = new THREE.MeshPhongMaterial({ color: 0x555555, specular: 0x111111, shininess: 200 });
            const mesh = new THREE.Mesh(geometry, material);

            geometry.computeBoundingBox();
            const center = geometry.boundingBox.getCenter(new THREE.Vector3());
            mesh.position.x = -center.x;
            mesh.position.y = -center.y;
            mesh.position.z = -center.z;
            mesh.rotation.x = -Math.PI / 4;

            scene.add(mesh);
        };

        reader.readAsArrayBuffer(blob);
    });

    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
    }

    animate();
}


