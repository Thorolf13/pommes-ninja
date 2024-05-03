import p5 from "p5";
import assetsList from './assets.json';

type Assets = { [key: string]: p5.Image }
type Fonts = { [key: string]: p5.Font }

const COEF_M_PIXEL = 120

const random = {
  boolean: () => Math.random() > 0.5,
  int: (min, max) => Math.floor(Math.random() * (max - min + 1) + min),
  float: (min, max) => Math.random() * (max - min) + min,
  sign: () => Math.random() > 0.5 ? 1 : -1,
  bet: (percent) => Math.random() * 100 < percent,
}

class Vector2 {
  x: number;
  y: number;

  constructor (x, y) {
    this.x = x;
    this.y = y;
  }

  add (v) {
    return new Vector2(this.x + v.x, this.y + v.y);
  }

  sub (v) {
    return new Vector2(this.x - v.x, this.y - v.y);
  }

  mult (s) {
    return new Vector2(this.x * s, this.y * s);
  }

  div (s) {
    return new Vector2(this.x / s, this.y / s);
  }
  length () {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  rotate (rad, center) {
    const x = this.x - center.x;
    const y = this.y - center.y;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return new Vector2(x * cos - y * sin + center.x, x * sin + y * cos + center.y);
  }
}

class Segment2 {
  p1: Vector2;
  p2: Vector2;

  constructor (p1, p2) {
    this.p1 = p1;
    this.p2 = p2;
  }

  rotate (rad, center) {
    return new Segment2(this.p1.rotate(rad, center), this.p2.rotate(rad, center));
  }

  intersect (segment) {
    const { p1, p2 } = segment;
    const s1_x = this.p2.x - this.p1.x;
    const s1_y = this.p2.y - this.p1.y;
    const s2_x = p2.x - p1.x;
    const s2_y = p2.y - p1.y;

    const s = (-s1_y * (this.p1.x - p1.x) + s1_x * (this.p1.y - p1.y)) / (-s2_x * s1_y + s1_x * s2_y);
    const t = (s2_x * (this.p1.y - p1.y) - s2_y * (this.p1.x - p1.x)) / (-s2_x * s1_y + s1_x * s2_y);

    return s >= 0 && s <= 1 && t >= 0 && t <= 1;
  }
}

class Box2 {
  INSIDE = 0b0000;
  LEFT = 0b0010;
  RIGHT = 0b0001;
  BOTTOM = 0b0100;
  TOP = 0b1000;

  pos: Vector2;
  size: Vector2;
  rotation: number;

  constructor (center, size, rotation) {
    this.pos = center;
    this.size = size;
    this.rotation = rotation;
  }

  intersect (segment) {
    const rotated = segment.rotate(-this.rotation, this.pos);
    const { p1, p2 } = rotated;

    const a = this.pos.sub(this.size.div(2));
    const c = this.pos.add(this.size.div(2));
    const b = new Vector2(c.x, a.y);
    const d = new Vector2(a.x, c.y);

    let region1 = this.INSIDE;
    if (p1.x < a.x) region1 |= this.LEFT;
    if (p1.x > c.x) region1 |= this.RIGHT;
    if (p1.y < a.y) region1 |= this.BOTTOM;
    if (p1.y > c.y) region1 |= this.TOP;

    let region2 = this.INSIDE;
    if (p2.x < a.x) region2 |= this.LEFT;
    if (p2.x > c.x) region2 |= this.RIGHT;
    if (p2.y < a.y) region2 |= this.BOTTOM;
    if (p2.y > c.y) region2 |= this.TOP;

    if (region1 === this.INSIDE || region2 === this.INSIDE) return true;
    if (region1 & region2) return false;

    return rotated.intersect(new Segment2(a, b)) ||
      rotated.intersect(new Segment2(b, c)) ||
      rotated.intersect(new Segment2(c, d)) ||
      rotated.intersect(new Segment2(d, a));
  }

  contains (point) {
    const rotated = point.rotate(-this.rotation, this.pos);
    const a = this.pos.sub(this.size.div(2));
    const c = this.pos.add(this.size.div(2));

    return rotated.x >= a.x && rotated.x <= c.x && rotated.y >= a.y && rotated.y <= c.y;
  }
}

class GObject {

  id: number;
  box: Box2;
  asset: string;
  v: Vector2;
  f: Vector2;
  vr: number;
  state: any;
  isImmobile: boolean;

  /**
   * 
   * @param {*} id 
   * @param {*} pos center of the object 
   * @param {*} size 
   * @param {*} asset p5.js Image
   */
  constructor (id, pos, size, asset) {
    this.id = id;
    this.box = new Box2(pos, size, 0);
    this.asset = asset;

    this.v = new Vector2(0, 0);
    this.f = new Vector2(0, 0);
    this.vr = 0;
    this.state = {};

    this.isImmobile = false;
  }

  setRotation (r) {
    this.box.rotation = r;
  }

  setState (state) {
    this.state = state;
  }

  setVelocity (v) {
    this.v = v;
  }

  setMoment (vr) {
    this.vr = vr;
  }

  applyForce (f) {
    if (this.isImmobile) {
      return;
    }
    this.f = f;
  }

  update (time) {
    const seconds = time / 1000;

    this.v = this.v.add(this.f.mult(seconds));
    this.box.pos = this.box.pos.add(this.v.mult(seconds));
    this.box.rotation += this.vr * seconds;

    // console.log('update', time, 'pos', this.box.pos.x, this.box.pos.y, 'v', this.v.x, this.v.y, 'f', this.f.x, this.f.y);
    // Z;
  }
}

class GRender {
  p: p5;

  width: number;
  height: number;
  assets: Assets;
  fonts: Fonts;

  renderer: p5.Renderer;

  constructor (p: p5, width: number, height: number, assets: Assets, fonts: Fonts) {
    this.p = p;

    this.width = width;
    this.height = height;

    this.assets = assets;
    this.fonts = fonts;

    this.renderer = this.p.createCanvas(width, height);
  }


  drawBackground (asset: string, mode: 'repeat' | 'cover'): void {
    const img = this.getAsset(asset);
    if (mode === 'repeat') {
      for (let x = 0; x < this.width; x += img.width) {
        for (let y = 0; y < this.height; y += img.height) {
          this.p.image(img, x, y);
        }
      }
    } else {
      this.p.image(img, 0, 0, this.width, this.height);
    }

  }

  getAsset (name: string): p5.Image {
    if (!this.assets[name]) throw new Error('Asset not found: ' + name + ' in ' + Object.keys(this.assets));

    return this.assets[name];
  }

  drawGame (state: any, objects: GObject[]): void {
    this.drawBackground('background', 'repeat');
    if (state.status === 'menu') {
      this.drawTitle()
      this.drawStartZone();
    } else if (state.status === 'gameover') {
      this.drawGameOverInfos(state.score, state.bestScore);
      this.drawStartZone();
    } else {
      this.drawLives(state.lives);
      this.drawScore(state.score);
    }
    objects.forEach((obj) => this.drawObject(obj));
  }

  drawObject (gobject: GObject): void {
    const { pos, size, rotation } = gobject.box;
    const { asset } = gobject;

    this.drawImage(asset, pos, size, rotation);
  }

  drawImage (asset: string, pos: Vector2, size: Vector2, rotation: number): void {
    if (rotation !== undefined && rotation !== null && rotation !== 0) {
      // console.log('drawObject', pos.x, pos.y, 'rotation', rotation, 'size', size.x, size.y, 'asset', asset.width, asset.height)
      this.p.push();
      this.p.translate(pos.x, pos.y);
      this.p.rotate(rotation);
      this.p.image(this.getAsset(asset), -size.x / 2, -size.y / 2, size.x, size.y);
      this.p.pop();
    } else {
      this.p.image(this.getAsset(asset), pos.x - size.x / 2, pos.y - size.y / 2, size.x, size.y);
    }
  }


  drawTitle (): void {
    this.p.image(this.getAsset('title'), (this.width - 641) / 2, (this.height) / 2 - 100, 641, 127);
  }

  drawStartZone (): void {
    // fill(255, 0, 0);
    // circle(this.width / 2 + 200, this.height / 2 + 100, 50);
    this.p.image(this.getAsset('newgame'), (this.width - 195) / 2 + 200, (this.height - 195) / 2 + 100, 195, 195);
  }

  drawScore (score: number): void {
    this.p.textFont(this.fonts['gang_of_three']);

    this.p.fill(255);
    this.p.strokeWeight(0);
    this.p.textSize(32);
    this.p.text('Score: ' + score, this.width - 180, 30);
  }

  drawGameOverInfos (score: number, bestScore: number): void {
    this.p.textFont(this.fonts['gang_of_three']);

    this.p.image(this.getAsset('gameover'), (this.width - 490) / 2, (this.height) / 2 - 100, 490, 85);
    this.p.fill(255);
    this.p.strokeWeight(0);
    this.p.textSize(32);
    this.p.text('Score: ' + score, this.width / 2 - 220, this.height / 2 + 50);
    this.p.text('Best Score: ' + bestScore, this.width / 2 - 220, this.height / 2 + 100);
  }

  drawLives (lives: number): void {

    for (let i = 0; i < 3; i++) {
      const x = 16 + i * 30;
      const y = 10;

      const asset = i < lives ? 'live_on' : 'live_off';

      this.p.image(this.getAsset(asset), x, y, 26, 26);
    }
  }

  drawCurve (points: Vector2[], weight: number, color: [number, number, number]): void {
    this.p.stroke(...color);
    this.p.noFill()
    this.p.strokeWeight(weight);
    this.p.beginShape();
    points.forEach((pos) => {
      this.p.curveVertex(pos.x, pos.y);
    })
    this.p.endShape();
  }

  drawMouse (mousePos: Vector2[]): void {
    for (let i = 0; i < mousePos.length - 3; i++) {
      this.drawCurve(mousePos.slice(i, i + 4), 3 + i, [255, 255, 255]);
    }
  }
}


class GameState {

  width: number;
  height: number;

  objects: GObject[];
  mousePos: Vector2[];

  lastTime: number;

  state: any;

  constructor (width: number, height: number) {
    this.width = width;
    this.height = height;

    this.objects = [];
    this.mousePos = [];

    this.lastTime = null;

    this.init()
  }

  init (): void {
    console.log('init');
    this.state = {
      score: 0,
      bestScore: 0,
      lives: 3,
      status: 'menu',
    }

    this.addStartFruit();
  }

  startGame (): void {
    console.log('startGame');
    this.state.status = 'playing';
    this.state.score = 0;
    this.state.lives = 3;
  }

  gameover (): void {
    console.log('gameover');
    this.state.status = 'gameover';
    this.state.bestScore = Math.max(this.state.bestScore, this.state.score);
    this.objects = [];

    this.addStartFruit();
  }

  addStartFruit (): void {
    const asset = 'apple_1-full';
    const pos = new Vector2(this.width / 2 + 200, this.height / 2 + 100);
    const size = new Vector2(66, 66);

    const fruit = new GObject(this.objects.length, pos, size, asset);
    fruit.isImmobile = true;

    fruit.setState({ type: 'fruit', state: 'full' });

    this.objects.push(fruit);
  }

  update (time: number): void {
    if (!this.lastTime) {
      this.lastTime = time;
      return;
    }
    const eslapsedTimeMs = time - this.lastTime;
    if (eslapsedTimeMs > 500) {
      this.lastTime = time;
      return;
    }

    if (this.state.status === 'playing') {
      const nbMaxFruits = 2 + Math.floor(Math.sqrt(this.state.score) / 3);
      if (this.objects.length == 0 || (random.bet(5) && this.objects.length < (nbMaxFruits * 0.7))) {

        const nbSpawn = random.int(0, nbMaxFruits - 1)
        for (let i = 0; i < nbSpawn; i++) {
          this.spawnFruit('fruit');
        }
        if (random.bet(5)) {
          this.spawnFruit('bomb');
        }
      }
    }


    this.objects
      .filter((obj) => (obj.state.type === 'fruit' || obj.state.type === 'bomb') && obj.state.state === 'full')
      .forEach((fruit) => {
        if (this.isSliced(fruit)) {
          if (fruit.state.type === 'bomb') {
            this.state.lives = 0;
            this.gameover();
            return;
          }

          this.sliceFruit(fruit);
          this.state.score += 1;


          if (this.state.status === 'menu' || this.state.status === 'gameover') {
            this.startGame();
          }
        }
      })

    if (this.state.status === 'menu' || this.state.status === 'gameover') {
      return;
    }

    //objects out of screen
    this.objects
      .filter(obj => obj.box.pos.y > this.height + 100 && obj.v.y > 0)
      .forEach((obj) => {
        const index = this.objects.indexOf(obj);
        this.objects.splice(index, 1);

        if (obj.state.type === 'fruit' && obj.state.state === 'full') {
          this.state.lives--;
        }
      })

    if (this.state.lives <= 0) {
      this.gameover();
    }


    this.objects.forEach((obj) => {
      obj.applyForce(new Vector2(0, 9.81 * COEF_M_PIXEL));
      obj.update(eslapsedTimeMs);
    })

    this.lastTime = time;
  }

  isSliced (fruit: GObject): boolean {
    if (this.mousePos.length <= 3) return false;
    for (let i = 0; i < 3; i++) {
      const p1 = this.mousePos[this.mousePos.length - 1 - i];
      const p2 = this.mousePos[this.mousePos.length - 2 - i];
      const segment = new Segment2(p1, p2);

      if (fruit.box.intersect(segment)) {
        return true;
      }
    }
  }

  onMouseMove (mousePos: Vector2): void {
    this.mousePos.push(mousePos);

    this.mousePos = this.mousePos.slice(-10);
  }

  spawnFruit (type: 'fruit' | 'bomb'): void {
    const toRight = random.boolean();

    const asset = type == 'fruit' ? 'apple_1-full' : 'strawberry-full'
    const pos = new Vector2(toRight ? random.float(0, this.width / 2) : random.float(this.width / 2, this.width), this.height + 50);
    const size = new Vector2(66, 66);
    const v = new Vector2((toRight ? 1 : -1) * random.float(1, 3), -random.float(7, 9.5)).mult(COEF_M_PIXEL);
    const vr = random.float(2, 8) * random.sign()

    // console.log('spawnFruit', pos.x, pos.y, 'v', v.x, v.y, 'vr', vr);

    const fruit = new GObject(this.objects.length, pos, size, asset);
    fruit.setVelocity(v);
    fruit.setMoment(vr);
    fruit.setState({ type, state: 'full' });

    this.objects.push(fruit);
  }

  sliceFruit (fruit: GObject): void {
    const index = this.objects.indexOf(fruit);
    this.objects.splice(index, 1);

    const assetLeft = 'apple_1-left';
    const assetRight = 'apple_1-right';

    const left = new GObject(this.objects.length, fruit.box.pos, fruit.box.size, assetLeft);
    const right = new GObject(this.objects.length, fruit.box.pos, fruit.box.size, assetRight);

    const c = random.sign();
    const vLeft = new Vector2(c * 1.2, 0).mult(COEF_M_PIXEL);
    const vRight = new Vector2(c * -1.2, 0).mult(COEF_M_PIXEL);

    left.setVelocity(vLeft);
    right.setVelocity(vRight);
    left.setMoment(fruit.vr * random.sign());
    right.setMoment(fruit.vr * random.sign());

    left.setState({ type: fruit.state.type, state: 'left' });
    right.setState({ type: fruit.state.type, state: 'right' });

    this.objects.push(left);
    this.objects.push(right);
  }

}



export function sketch (p: p5) {

  const WIDTH = 800;
  const HEIGHT = 600;
  let gameState;
  let renderer;
  const fonts: Fonts = {};
  const assets: Assets = {};

  p.preload = () => {
    for (const key in assetsList) {
      console.log('preload', key);
      assets[key] = p.loadImage(assetsList[key]);
    }
    fonts['gang_of_three'] = p.loadFont('/fonts/GangofThree.ttf');
  }

  p.setup = () => {

    gameState = new GameState(WIDTH, HEIGHT);
    renderer = new GRender(p, WIDTH, HEIGHT, assets, fonts);
  }

  p.draw = () => {
    const time = p.millis();
    const mousePos = new Vector2(p.mouseX, p.mouseY);
    gameState.onMouseMove(mousePos);

    gameState.update(time);

    renderer.drawGame(gameState.state, gameState.objects)
    renderer.drawMouse(gameState.mousePos);
  }
}

