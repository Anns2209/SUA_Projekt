const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Statistics Service API',
      version: '1.0.0',
      description:
        'Statistika klicev za mikrostoritve gostilne (spremljanje uporabe endpointov Order Service).',
    },
    servers: [{ description: 'Trenutni strežnik' }],
  },
  apis: ['./server.js'],
};

module.exports = swaggerJsdoc(options);