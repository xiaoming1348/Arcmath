// Arcmath HK VPS — PM2 配置
//
// 在 apps/web 目录下用：
//   pm2 start ../../deploy/hk-vps/ecosystem.config.cjs
//
// 之后每次 deploy：
//   pm2 reload arcmath-web

module.exports = {
  apps: [
    {
      name: "arcmath-web",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      cwd: "/home/arcmath/arcmath/apps/web",
      instances: 2,                 // 4 vCPU 跑 2 worker，留一半给 nginx + 系统
      exec_mode: "cluster",
      env: {
        NODE_ENV: "production",
        PORT: "3000"
      },
      max_memory_restart: "1G",     // 单 worker 超过 1G 自动 reload
      error_file: "/home/arcmath/logs/web-err.log",
      out_file: "/home/arcmath/logs/web-out.log",
      time: true,                   // log 加时间戳
      kill_timeout: 8000            // 给 in-flight 请求 8s 收尾
    }
  ]
};
