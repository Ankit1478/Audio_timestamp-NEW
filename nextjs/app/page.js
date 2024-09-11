'use client'

import { useState } from 'react';

export default function AudioProcessor() {
  const [mainAudio, setMainAudio] = useState(null);
  const [shortAudios, setShortAudios] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState('');
  const [error, setError] = useState('');

  const isAacFile = (file) => {
    return file.type === 'audio/aac' || file.name.toLowerCase().endsWith('.aac');
  };

  const handleMainAudioChange = (e) => {
    const file = e.target.files[0];
    if (file && isAacFile(file)) {
      setMainAudio(file);
      setError('');
    } else {
      setMainAudio(null);
      setError('Please select an AAC file for the main audio.');
    }
  };

  const handleShortAudiosChange = (e) => {
    const files = Array.from(e.target.files);
    const aacFiles = files.filter(isAacFile);
    if (aacFiles.length === files.length) {
      setShortAudios(aacFiles);
      setError('');
    } else {
      setShortAudios([]);
      setError('Please select only AAC files for the short audios.');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setProcessing(true);
    setError('');
    setDownloadUrl('');

    const formData = new FormData();
    formData.append('mainAudio', mainAudio);
    shortAudios.forEach((audio) => formData.append('shortAudios', audio));

    try {
      const response = await fetch('http://localhost:5001/process', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Processing failed');

      const data = await response.json();
      setDownloadUrl(`http://localhost:5001${data.downloadUrl}`);
    } catch (err) {
      setError('Processing failed. Please try again.');
      console.error(err);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-10 p-6 bg-white rounded-lg shadow-xl">
      <h1 className="text-2xl font-bold mb-4">Audio Processor</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="mainAudio" className="block text-sm font-medium text-gray-700">
            Main Audio (AAC only)
          </label>
          <input
            type="file"
            id="mainAudio"
            accept="audio/aac,.aac"
            onChange={handleMainAudioChange}
            className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
        </div>
        <div>
          <label htmlFor="shortAudios" className="block text-sm font-medium text-gray-700">
            Short Audios (AAC only, up to 10)
          </label>
          <input
            type="file"
            id="shortAudios"
            accept="audio/aac,.aac"
            multiple
            onChange={handleShortAudiosChange}
            className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
        </div>
        <button
          type="submit"
          disabled={!mainAudio || shortAudios.length === 0 || processing}
          className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
        >
          {processing ? 'Processing...' : 'Process Audio'}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          className="mt-4 inline-block text-sm text-blue-600 hover:text-blue-800"
        >
          Download Processed Audio
        </a>
      )}
    </div>
  );
}