import { app, InvocationContext } from "@azure/functions";
import axios from "axios";

// Definición de tipos para las rutas
interface RouteMapping {
  SIIT30: string;
  SIIF43: string;
  SIIT87: string;
  END0004F: string;
  [key: string]: string;
}

// Mapeo de nombres de archivo a rutas del microservicio
const routes: RouteMapping = {
  SIIT30: process.env.ROUTE_SIIT30 || '/api/fm-files/mini-maestra',
  SIIF43: process.env.ROUTE_SIIF43 || '/api/fm-files/mov-reason',
  SIIT87: process.env.ROUTE_SIIT87 || '/api/fm-files/quota-utilization',
  END0004F: process.env.ROUTE_END0004F || '/api/fm-files/ley-insolvencia'
};

export async function processBlobTrigger(
  blob: unknown,
  context: InvocationContext
): Promise<void> {
  try {
    if (!context.triggerMetadata) {
      throw new Error("triggerMetadata is undefined");
    }
    const blobPath = context.triggerMetadata.blobPath as string;
    const blobName = context.triggerMetadata.name as string;
    const specificPath = process.env.SPECIFIC_BLOB_PATH || "cto_actibo/in";

    // Verificar si el blob está en la ruta específica
    if (!blobPath.startsWith(specificPath)) {
      context.log(`Blob ignorado: ${blobPath} no está en la ruta ${specificPath}`);
      return;
    }

    context.log(`Procesando blob: ${blobPath}`);
    context.log(`Nombre del blob: ${blobName}`);
    
    // Convertir blob a Buffer si es necesario
    const blobBuffer = Buffer.isBuffer(blob) ? blob : Buffer.from(blob as ArrayBuffer);
    context.log(`Tamaño del blob: ${blobBuffer.length} bytes`);

    // Extraer el nombre del archivo sin extensión
    const fileName = blobPath.split("/").pop() || "";
    const fileNameWithoutExtension = fileName.replace(/\.[^/.]+$/, "");

    // Buscar la ruta correspondiente según el nombre del archivo
    const matchedRoute = routes[fileNameWithoutExtension];

    if (!matchedRoute) {
      context.warn(`No se encontró ruta para el archivo: ${fileNameWithoutExtension}`);
      context.warn(`Rutas disponibles: ${Object.keys(routes).join(", ")}`);
      return;
    }

    // Construir la URL del microservicio
    const microserviceBaseUrl = process.env.MICROSERVICE_BASE_URL;
    
    if (!microserviceBaseUrl) {
      throw new Error("MICROSERVICE_BASE_URL no está configurada");
    }

    const url = `${microserviceBaseUrl}${matchedRoute}`;
    
    context.log(`Ruta identificada: ${matchedRoute}`);
    context.log(`Llamando al microservicio: ${url}`);

    // Hacer la petición GET al microservicio
    const response = await axios.get(url, {
      timeout: parseInt(process.env.REQUEST_TIMEOUT || "100000"),
      headers: {
        "Content-Type": "application/json",
       /*  ...(process.env.MICROSERVICE_API_KEY && {
          "Authorization": `Bearer ${process.env.MICROSERVICE_API_KEY}`
        }) */
      }
    });

    context.log(`✅ Respuesta exitosa del microservicio: ${response.status}`);
    context.log(`Datos recibidos: ${JSON.stringify(response.data)}`);

  } catch (error) {
    context.error(`❌ Error procesando blob: ${error}`);
    
    if (axios.isAxiosError(error)) {
      context.error(`Status: ${error.response?.status}`);
      context.error(`Data: ${JSON.stringify(error.response?.data)}`);
    }
    
    throw error;
  }
}

app.storageBlob("blobTrigger", {
  path: `${process.env.BLOB_CONTAINER_NAME || 'your-container-name'}/${process.env.SPECIFIC_BLOB_PATH || 'cto_actibo/in'}/{blobName}`,
  connection: "AzureWebJobsStorage",
  handler: processBlobTrigger,
});