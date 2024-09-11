const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const ffprobeStatic = require('ffprobe-static');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());

// Set the FFmpeg and FFprobe paths
ffmpeg.setFfmpegPath(ffmpegStatic);
ffmpeg.setFfprobePath(ffprobeStatic.path);

// Define directory paths
const uploadsDir = path.join(__dirname, 'uploads');
const publicDir = path.join(__dirname, 'public');
const outputDir = path.join(__dirname, 'output');

// Create necessary directories
[uploadsDir, publicDir, outputDir].forEach(dir => {
  fs.mkdirSync(dir, { recursive: true });
});

// Configure multer to use the uploads directory
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir)
  },
  filename: function (req, file, cb) {
    cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname))
  }
});

const upload = multer({ storage: storage });

app.post('/process', upload.fields([
  { name: 'mainAudio', maxCount: 1 },
  { name: 'shortAudios', maxCount: 10 }
]), (req, res) => {
  if (!req.files.mainAudio || !req.files.shortAudios) {
    return res.status(400).send('Please upload one main audio file and at least one short audio file.');
  }

  const mainAudioFile = req.files.mainAudio[0].path;
  const shortAudioFiles = req.files.shortAudios.map(file => file.path);
  const outputFileName = `output_${Date.now()}.aac`;
  const finalOutputPath = path.join(publicDir, outputFileName);

  console.log('Starting audio processing...');
  console.log('Main audio file:', mainAudioFile);
  console.log('Short audio files:', shortAudioFiles);

  processAudio(mainAudioFile, shortAudioFiles, finalOutputPath)
    .then(() => {
      console.log('Processing finished successfully');
      const downloadUrl = `/download/${outputFileName}`;
      res.json({ message: 'Audio processed successfully', downloadUrl });

      // Clean up input files
      [mainAudioFile, ...shortAudioFiles].forEach(filePath => {
        fs.unlink(filePath, err => {
          if (err) console.error(`Error deleting file ${filePath}:`, err);
        });
      });
    })
    .catch(err => {
      console.error('Error during audio processing:', err);
      res.status(500).json({ error: 'Error processing audio: ' + err.message });
    });
});

function processAudio(mainAudioFile, shortAudioFiles, outputPath) {
  return new Promise((resolve, reject) => {
    // Check if files exist
    if (!fs.existsSync(mainAudioFile)) {
      reject(new Error(`Main audio file not found: ${mainAudioFile}`));
      return;
    }

    shortAudioFiles.forEach(file => {
      if (!fs.existsSync(file)) {
        reject(new Error(`Short audio file not found: ${file}`));
        return;
      }
    });

    let command = ffmpeg();

    // Add the main audio file
    command.input(mainAudioFile);

    // Add the short audio files
    shortAudioFiles.forEach(file => {
      command = command.input(file);
    });

    // Prepare complex filter
    const filterComplex = [];
    const mixAudio = ['0:a'];

    // Get the duration of the main audio file
    ffmpeg.ffprobe(mainAudioFile, (err, metadata) => {
      if (err) {
        console.error('FFprobe error:', err);
        reject(err);
        return;
      }

      console.log('FFprobe metadata:', metadata);

      const mainDuration = metadata.format.duration;

      shortAudioFiles.forEach((_, index) => {
        const inputIndex = index + 1;
        const delay = Math.floor(Math.random() * (mainDuration - 4)) * 1000; // Convert to milliseconds
        const outputLabel = `delayed${inputIndex}`;

        const minutes = Math.floor(delay / 60000);
        const seconds = ((delay % 60000) / 1000).toFixed(2);
        console.log(`Short Audio ${inputIndex}: Added at ${minutes}m ${seconds}s into the track`);

        // Apply volume adjustment (60%) and delay to short audio files
        filterComplex.push(`[${inputIndex}:a]volume=0.4,atrim=duration=4,asetpts=PTS-STARTPTS,adelay=${delay}|${delay}[${outputLabel}]`);
        mixAudio.push(outputLabel);
      });

      // Mix all audio streams
      filterComplex.push(`[${mixAudio.join('][')}]amix=inputs=${mixAudio.length}:duration=longest[out]`);

      command
        .complexFilter(filterComplex, 'out')
        .audioCodec('aac')
        .audioBitrate('128k')
        .toFormat('adts')
        .on('start', (commandLine) => {
          console.log('Spawned FFmpeg with command: ' + commandLine);
        })
        .on('progress', (progress) => {
          console.log('Processing: ' + progress.percent + '% done');
        })
        .on('end', resolve)
        .on('error', (err, stdout, stderr) => {
          console.error('Error:', err);
          console.error('FFmpeg stdout:', stdout);
          console.error('FFmpeg stderr:', stderr);
          reject(err);
        })
        .save(outputPath);
    });
  });
}

// Serve files from the public directory
app.use(express.static(publicDir));

// Add a route for downloading the processed file
app.get('/download/:filename', (req, res) => {
  const filePath = path.join(publicDir, req.params.filename);
  res.download(filePath, (err) => {
    if (err) {
      res.status(404).send('File not found');
    }
  });
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});