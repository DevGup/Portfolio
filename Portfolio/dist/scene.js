(() => {
  const projectLinks = [...document.querySelectorAll('.index a')];
  const projects = projectLinks.map(link => document.querySelector(link.hash));

  function updateIndex() {
    const marker = Math.min(230, window.innerHeight * 0.4);
    const active = projects.findIndex(project => {
      const bounds = project.getBoundingClientRect();
      return bounds.top <= marker && bounds.bottom > marker;
    });
    projectLinks.forEach((link, index) => {
      if (index === active) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }

  let scrollFrame = 0;
  function scheduleIndexUpdate() {
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0;
      updateIndex();
    });
  }
  window.addEventListener('scroll', scheduleIndexUpdate, { passive: true });
  window.addEventListener('resize', scheduleIndexUpdate);
  updateIndex();

  const trigger = document.querySelector('#retry');
  const status = document.querySelector('#pipeline-status');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const steps = [
    ['failure', 'The worker fails while processing the job.', 'See what happens next'],
    ['queued', 'The failed job moves to the dead-letter queue.', 'Retry the job'],
    ['retry', 'After a backoff delay, the job is sent back to Kafka.', 'Finish processing'],
    ['done', 'A worker completes the retried job. Idempotency prevents duplicate results.', 'Run again']
  ];
  let step = 0;

  trigger.addEventListener('click', () => {
    const [state, message, nextLabel] = steps[step];
    pipelineScene?.setState(state);
    status.textContent = message;
    trigger.textContent = nextLabel;
    step = (step + 1) % steps.length;
  });
  trigger.hidden = false;

  // All scene geometry is defined in world space and projected through an orbit camera.
  const cubeCorners = [
    [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
    [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]
  ];
  const cubeFaces = [
    [0, 3, 2, 1], [4, 5, 6, 7], [0, 4, 7, 3],
    [1, 2, 6, 5], [3, 7, 6, 2], [0, 1, 5, 4]
  ];
  const shades = [0.46, 0.86, 0.57, 0.72, 1, 0.4];
  const blue = [124, 153, 250];
  const silver = [184, 208, 255];
  const mint = [109, 247, 213];
  const coral = [255, 142, 103];
  const socket = [43, 62, 133];
  const nodes = [
    { label: 'Job API', point: [-2.75, 0, 0] },
    { label: 'Kafka', point: [0, 0, 0] },
    { label: 'Worker', point: [2.75, 0, 0] },
    { label: 'DLQ', point: [2.75, 0, 2] }
  ];
  const track = {
    failure: [0, 1, 2], queued: [2, 3], retry: [3, 1], done: [1, 2]
  };

  function createScene(canvas, kind) {
    const context = canvas.getContext('2d');
    if (!context) return null;
    const isHero = kind === 'hero';
    const parent = canvas.parentElement;
    let visible = false;
    let paused = false;
    let frame = 0;
    let time = 0;
    let previous = null;
    let pointer = null;
    let orbitX = 0;
    let orbitY = 0;
    let stateStart = 0;
    let state = '';
    const faces = [];

    function box(center, size, color, project) {
      const points = cubeCorners.map(corner =>
        project(center.map((value, axis) => value + corner[axis] * size[axis] / 2))
      );
      cubeFaces.forEach((indices, side) => {
        const polygon = indices.map(index => points[index]);
        const [a, b, c] = polygon;
        if ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) >= 0) return;
        faces.push({
          polygon,
          depth: polygon.reduce((sum, point) => sum + point.z, 0) / 4,
          color: color.map(channel => Math.round(channel * shades[side]))
        });
      });
    }

    function line(start, end, project, color) {
      const a = project(start);
      const b = project(end);
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.strokeStyle = color;
      context.stroke();
    }

    function draw() {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!width || !height) return;
      const ratio = Math.min(devicePixelRatio || 1, 2);
      const pixelWidth = Math.round(width * ratio);
      const pixelHeight = Math.round(height * ratio);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);

      const scroll = Math.min(1, Math.max(0, -parent.getBoundingClientRect().top / height));
      const still = reducedMotion.matches;
      const yaw = orbitX + (isHero ? -0.48 : -0.32) +
        (still ? 0 : isHero ? time * 0.38 + scroll * 1.2 : Math.sin(time * 0.65) * 0.12);
      const pitch = orbitY + 0.39 + (still || !isHero ? 0 : scroll * 0.34);
      const cy = Math.cos(yaw);
      const sy = Math.sin(yaw);
      const cx = Math.cos(pitch);
      const sx = Math.sin(pitch);
      const scale = Math.min(width / (isHero ? 7 : 9.7), height / (isHero ? 5.9 : 5.8));

      function project([x, y, z]) {
        const horizontal = x * cy + z * sy;
        const depth = z * cy - x * sy;
        const vertical = y * cx - depth * sx;
        const toward = y * sx + depth * cx;
        const perspective = 12 / (12 - toward);
        return {
          x: width / 2 + horizontal * scale * perspective,
          y: height * (isHero ? 0.49 : 0.44) - vertical * scale * perspective,
          z: toward
        };
      }

      context.lineWidth = 1;
      for (let cell = -5; cell <= 5; cell++) {
        line([cell, -1.2, -4], [cell, -1.2, 4], project, '#a4baff32');
        line([-5, -1.2, cell], [5, -1.2, cell], project, '#a4baff32');
      }

      faces.length = 0;
      if (isHero) {
        for (const [x, z, levels] of [[-1.55, 0.45, 3], [0, -0.68, 4], [1.55, 0.45, 2]]) {
          for (let level = 0; level < levels; level++) {
            const y = -0.82 + level * 0.61;
            box([x, y, z], [1.27, 0.48, 1.32], level === levels - 1 ? silver : blue, project);
            box([x - 0.16, y, z + 0.673], [0.62, 0.14, 0.05], socket, project);
            box([x + 0.41, y, z + 0.68], [0.13, 0.13, 0.08], mint, project);
          }
        }
        const t = still ? 0.75 : time * 1.16;
        box([2.4 * Math.cos(t), 1.6 + 0.26 * Math.sin(t), 1.7 * Math.sin(t)], [0.29, 0.29, 0.29], coral, project);
      } else {
        const path = track[state] || [0, 1, 2];
        const amount = still ? 0.92 : state === '' ? ((time * 0.5) % 1) : Math.min(1, (time - stateStart) / 1.35);
        const segment = Math.min(path.length - 2, Math.floor(amount * (path.length - 1)));
        const fraction = amount * (path.length - 1) - segment;
        const origin = nodes[path[segment]].point;
        const destination = nodes[path[segment + 1]].point;
        for (const [from, to] of [[0, 1], [1, 2], [2, 3], [3, 1]]) {
          const selected = path.some((index, i) => index === from && path[i + 1] === to);
          context.lineWidth = selected ? 3 : 1;
          line(nodes[from].point, nodes[to].point, project, selected ? '#a9ffec' : '#a7bafd6b');
        }
        nodes.forEach(({ point, label }) => {
          const alert = (label === 'Worker' && state === 'failure') || (label === 'DLQ' && state === 'queued');
          const success = (label === 'Kafka' && state === 'retry') || (label === 'Worker' && state === 'done');
          box(point, [1.43, 0.8, 1.06], alert ? coral : success ? mint : blue, project);
          box([point[0], point[1] + 0.43, point[2]], [1.24, 0.1, 0.88], alert ? coral : success ? mint : silver, project);
        });
        const packet = origin.map((value, i) => value + (destination[i] - value) * fraction);
        packet[1] += 0.85 + Math.sin(fraction * Math.PI) * 0.21;
        box(packet, [0.26, 0.26, 0.26], state === 'failure' || state === 'queued' ? coral : mint, project);
      }

      context.lineWidth = 0.8;
      context.strokeStyle = '#cadaff7d';
      faces.sort((a, b) => a.depth - b.depth);
      for (const face of faces) {
        context.beginPath();
        face.polygon.forEach((point, index) => {
          if (index === 0) context.moveTo(point.x, point.y);
          else context.lineTo(point.x, point.y);
        });
        context.closePath();
        context.fillStyle = 'rgb(' + face.color.join(',') + ')';
        context.fill();
        context.stroke();
      }

      if (!isHero) {
        context.textAlign = 'center';
        context.font = '650 ' + Math.max(11, Math.min(16, width / 40)) + 'px "Segoe UI", sans-serif';
        nodes.forEach(({ point, label }) => {
          const marker = project([point[0], point[1] + 0.96, point[2]]);
          context.fillStyle = '#fff';
          context.fillText(label, marker.x, marker.y - 5);
        });
      }
    }

    function animate(now) {
      if (previous !== null) time += Math.min((now - previous) / 1000, 0.05);
      previous = now;
      draw();
      frame = requestAnimationFrame(animate);
    }

    function refresh() {
      cancelAnimationFrame(frame);
      previous = null;
      draw();
      if (visible && !paused && !pointer && !reducedMotion.matches && !document.hidden) {
        frame = requestAnimationFrame(animate);
      }
    }

    canvas.dataset.interactive = '';
    canvas.addEventListener('pointerdown', event => {
      if (!event.isPrimary || event.button !== 0) return;
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
      refresh();
    });
    canvas.addEventListener('pointermove', event => {
      if (pointer?.id !== event.pointerId) return;
      orbitX += (event.clientX - pointer.x) * 0.012;
      orbitY = Math.max(-0.62, Math.min(0.65, orbitY + (event.clientY - pointer.y) * 0.01));
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      draw();
    });
    canvas.addEventListener('lostpointercapture', event => {
      if (pointer?.id !== event.pointerId) return;
      pointer = null;
      refresh();
    });

    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      refresh();
    }).observe(canvas);
    new ResizeObserver(draw).observe(canvas);
    reducedMotion.addEventListener('change', refresh);
    document.addEventListener('visibilitychange', refresh);
    refresh();

    return {
      orbit(direction) {
        orbitX += direction * Math.PI / 6;
        draw();
      },
      togglePause() {
        paused = !paused;
        refresh();
        return paused;
      },
      setState(next) {
        state = next;
        stateStart = time;
        draw();
      }
    };
  }

  const caseStudyObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) entry.target.classList.remove('is-animating');
      else if (entry.intersectionRatio >= 0.3) entry.target.classList.add('is-animating');
    }
  }, { threshold: [0, 0.3] });
  document.querySelectorAll('.art.banking, .art.telecom').forEach(figure => {
    caseStudyObserver.observe(figure);
  });

  const heroScene = createScene(document.querySelector('#hero-3d'), 'hero');
  if (heroScene) {
    document.querySelector('[data-gesture]').hidden = false;
    connectPause(document.querySelector('[data-hero-pause]'), heroScene);
  }
  const pipelineScene = createScene(document.querySelector('#pipeline-3d'), 'pipeline');
  const controls = document.querySelector('.scene-controls');
  if (pipelineScene) {
    controls.hidden = false;
    controls.querySelectorAll('[data-turn]').forEach(button => {
      button.addEventListener('click', () => pipelineScene.orbit(Number(button.dataset.turn)));
    });
    connectPause(controls.querySelector('[data-pause]'), pipelineScene);
  }

  function connectPause(pauseButton, scene) {
    pauseButton.hidden = reducedMotion.matches;
    reducedMotion.addEventListener('change', event => { pauseButton.hidden = event.matches; });
    pauseButton.addEventListener('click', () => {
      pauseButton.textContent = scene.togglePause() ? 'Resume motion' : 'Pause motion';
    });
  }

})();
