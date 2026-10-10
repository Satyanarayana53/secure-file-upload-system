import net from "net";

/**
 * ClamAV daemon scanner client.
 * Connects via TCP socket to clamd (e.g. localhost:3310 or Docker clamav container)
 * and streams complete file buffer using INSTREAM command according to the ClamAV protocol.
 */
export class ClamavScanner {
  constructor(options = {}) {
    this.host = options.host || process.env.CLAMAV_HOST || "localhost";
    this.port = parseInt(options.port || process.env.CLAMAV_PORT || "3310", 10);
    this.timeout = parseInt(options.timeout || process.env.SCAN_TIMEOUT_MS || "30000", 10);
    this.enabled = process.env.CLAMAV_ENABLED === "true";
  }

  /**
   * Health check to ping ClamAV daemon
   */
  async ping() {
    if (!this.enabled) {
      return { available: false, message: "ClamAV integration is disabled in configuration" };
    }

    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(3000);

      socket.connect(this.port, this.host, () => {
        socket.write("zPING\0");
      });

      socket.on("data", (data) => {
        const response = data.toString().trim();
        socket.destroy();
        resolve({ available: response.includes("PONG"), message: response });
      });

      socket.on("timeout", () => {
        socket.destroy();
        resolve({ available: false, message: "Connection timed out" });
      });

      socket.on("error", (err) => {
        socket.destroy();
        resolve({ available: false, message: err.message });
      });
    });
  }

  /**
   * Get ClamAV engine and signature version
   */
  async getVersion() {
    if (!this.enabled) return null;

    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(3000);

      socket.connect(this.port, this.host, () => {
        socket.write("zVERSION\0");
      });

      socket.on("data", (data) => {
        socket.destroy();
        resolve(data.toString().trim());
      });

      socket.on("error", () => {
        socket.destroy();
        resolve(null);
      });
    });
  }

  /**
   * Stream full file buffer to ClamAV daemon using INSTREAM protocol
   * 
   * Protocol specification:
   * 1. Send "zINSTREAM\0"
   * 2. Send chunks: [4-byte big-endian length][chunk bytes]
   * 3. Send [0x00 0x00 0x00 0x00] (0-length chunk) to indicate end of stream
   * 4. Read response:
   *    - "stream: OK" -> Clean
   *    - "stream: <threat_name> FOUND" -> Infected
   *    - Error message -> Scan Failed
   */
  async scanBuffer(buffer) {
    if (!this.enabled) {
      return {
        scanned: false,
        status: "UNAVAILABLE",
        reason: "ClamAV engine is not enabled in environment"
      };
    }

    return new Promise((resolve) => {
      const socket = new net.Socket();
      let response = "";
      let timedOut = false;

      socket.setTimeout(this.timeout);

      socket.connect(this.port, this.host, () => {
        // Step 1: Start INSTREAM command
        socket.write("zINSTREAM\0");

        // Step 2: Stream in chunks of up to 64KB
        const CHUNK_SIZE = 64 * 1024;
        let offset = 0;

        while (offset < buffer.length) {
          const chunk = buffer.slice(offset, offset + CHUNK_SIZE);
          const lengthBuffer = Buffer.alloc(4);
          lengthBuffer.writeUInt32BE(chunk.length, 0);

          socket.write(lengthBuffer);
          socket.write(chunk);
          offset += chunk.length;
        }

        // Step 3: Zero-length chunk ends stream
        const endChunk = Buffer.alloc(4);
        endChunk.writeUInt32BE(0, 0);
        socket.write(endChunk);
      });

      socket.on("data", (data) => {
        response += data.toString();
      });

      socket.on("end", () => {
        if (timedOut) return;
        socket.destroy();

        const trimmed = response.trim();
        if (trimmed.includes("FOUND")) {
          // stream: <VirusName> FOUND
          const match = trimmed.match(/stream:\s+(.+?)\s+FOUND/);
          const threatName = match ? match[1] : "Detected-Threat";
          resolve({
            scanned: true,
            status: "INFECTED",
            threatName,
            rawResponse: trimmed
          });
        } else if (trimmed.includes("OK")) {
          resolve({
            scanned: true,
            status: "CLEAN",
            threatName: null,
            rawResponse: trimmed
          });
        } else {
          resolve({
            scanned: false,
            status: "SCAN_FAILED",
            reason: `ClamAV indeterminate response: ${trimmed}`
          });
        }
      });

      socket.on("timeout", () => {
        timedOut = true;
        socket.destroy();
        resolve({
          scanned: false,
          status: "SCAN_FAILED",
          reason: `Scan timed out after ${this.timeout}ms`
        });
      });

      socket.on("error", (err) => {
        socket.destroy();
        resolve({
          scanned: false,
          status: "SCAN_FAILED",
          reason: `ClamAV socket connection error: ${err.message}`
        });
      });
    });
  }
}

export const clamavScanner = new ClamavScanner();
