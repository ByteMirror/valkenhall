import { Component, createRef } from 'preact';
import * as THREE from 'three';

const BOX_WIDTH = 2.2;
const BOX_HEIGHT = 3.08; // ~63/88 aspect
const BOX_DEPTH = 1.4;   // thick like a real deck box
const SPINE_COLOR = 0x3d3020;
const TOP_COLOR = 0x4a3a28;
const BOTTOM_COLOR = 0x1a140c;
const BACK_COLOR = 0x2a2018;

const textureLoader = new THREE.TextureLoader();
textureLoader.crossOrigin = 'anonymous';
const texCache = new Map();

function loadTex(url) {
  if (texCache.has(url)) return texCache.get(url);
  const tex = textureLoader.load(url);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  texCache.set(url, tex);
  return tex;
}

export default class DeckBox3D extends Component {
  constructor(props) {
    super(props);
    this.canvasRef = createRef();
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.mesh = null;
    this.animId = null;
    // Default: turned to show spine and top clearly
    this.targetRotY = -0.45;
    this.targetRotX = 0.2;
    this.currentRotY = -0.45;
    this.currentRotX = 0.2;
  }

  componentDidMount() {
    this.initScene();
    this.animate();
  }

  componentDidUpdate(prevProps) {
    if (prevProps.imageUrl !== this.props.imageUrl) {
      this.updateTexture();
    }
  }

  componentWillUnmount() {
    cancelAnimationFrame(this.animId);
    this.renderer?.dispose();
    this.scene?.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material.dispose();
      }
    });
  }

  initScene() {
    const canvas = this.canvasRef.current;
    if (!canvas) return;

    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    const dpr = Math.min(window.devicePixelRatio, 2);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(dpr);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();

    // Camera closer, wider FOV to show depth clearly
    this.camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);
    this.camera.position.set(0, 0.4, 4.2);
    this.camera.lookAt(0, 0, 0);

    // Warm lighting
    this.scene.add(new THREE.AmbientLight(0xfff5e0, 0.7));

    const key = new THREE.DirectionalLight(0xffeedd, 1.4);
    key.position.set(4, 5, 4);
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0xc0a878, 0.4);
    fill.position.set(-3, 2, 2);
    this.scene.add(fill);

    // Rim light from behind to edge-light the box
    const rim = new THREE.DirectionalLight(0xffe8c0, 0.3);
    rim.position.set(0, 2, -4);
    this.scene.add(rim);

    this.createBox();
  }

  createBox() {
    const geometry = new THREE.BoxGeometry(BOX_WIDTH, BOX_HEIGHT, BOX_DEPTH);

    const frontMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.45,
      metalness: 0.0,
    });

    // Spine (right side, visible when rotated)
    const spineMat = new THREE.MeshStandardMaterial({
      color: SPINE_COLOR,
      roughness: 0.7,
      metalness: 0.05,
    });

    // Top
    const topMat = new THREE.MeshStandardMaterial({
      color: TOP_COLOR,
      roughness: 0.75,
    });

    // Bottom / left / back
    const darkMat = new THREE.MeshStandardMaterial({ color: BOTTOM_COLOR, roughness: 0.85 });
    const backMat = new THREE.MeshStandardMaterial({ color: BACK_COLOR, roughness: 0.8 });

    if (this.props.imageUrl) {
      frontMat.map = loadTex(this.props.imageUrl);
      frontMat.needsUpdate = true;
    }

    // BoxGeometry face order: [+X right, -X left, +Y top, -Y bottom, +Z front, -Z back]
    this.mesh = new THREE.Mesh(geometry, [spineMat, darkMat, topMat, darkMat, frontMat, backMat]);
    this.mesh.rotation.y = this.currentRotY;
    this.mesh.rotation.x = this.currentRotX;
    this.scene.add(this.mesh);
  }

  updateTexture() {
    if (!this.mesh) return;
    const frontMat = this.mesh.material[4];
    if (this.props.imageUrl) {
      frontMat.map = loadTex(this.props.imageUrl);
      frontMat.needsUpdate = true;
    }
  }

  handleMouseMove = (e) => {
    const rect = this.canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    this.targetRotY = -0.45 + x * 0.7;
    this.targetRotX = 0.2 - y * 0.4;
  };

  handleMouseLeave = () => {
    this.targetRotY = -0.45;
    this.targetRotX = 0.2;
  };

  animate = () => {
    this.animId = requestAnimationFrame(this.animate);
    if (!this.mesh || !this.renderer) return;

    this.currentRotY += (this.targetRotY - this.currentRotY) * 0.08;
    this.currentRotX += (this.targetRotX - this.currentRotX) * 0.08;
    this.mesh.rotation.y = this.currentRotY;
    this.mesh.rotation.x = this.currentRotX;

    this.renderer.render(this.scene, this.camera);
  };

  render() {
    return (
      <canvas
        ref={this.canvasRef}
        className="w-full h-full"
        style={{ display: 'block' }}
        onMouseMove={this.handleMouseMove}
        onMouseLeave={this.handleMouseLeave}
      />
    );
  }
}
