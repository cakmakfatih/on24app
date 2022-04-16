import 'dart:io';

import 'package:desktop_window/desktop_window.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

enum View { loading, error, main, processing, scraperError }

const OUTPUT_PATH = "OUTPUT_PATH";
const NPM_PATH = "NPM_PATH";

class On24Page extends StatefulWidget {
  On24Page({Key? key}) : super(key: key);

  @override
  _On24PageState createState() => _On24PageState();
}

class _On24PageState extends State<On24Page> {
  View _currentView = View.loading;
  String? _npmPath;
  String? _outputPath;
  String? _scraperPath;
  late SharedPreferences _sharedPrefs;
  late String _emailAddress;
  late String _eventUrl;

  TextEditingController _outputPathController = TextEditingController();

  @override
  void initState() {
    super.initState();

    _emailAddress = "";
    _eventUrl = "";

    _init();
  }

  bool get _dataEntered => _emailAddress != "" && _eventUrl != "";

  Future<void> _init() async {
    if (Platform.isWindows || Platform.isLinux || Platform.isMacOS) {
      await DesktopWindow.setWindowSize(Size(380, 410));
    }

    _sharedPrefs = await SharedPreferences.getInstance();
    _setInitialPage();
  }

  Future<void> _setInitialPage() async {
    if (_scraperPath == null) {
      _scraperPath = Directory.current.path + "\\scraper";
    }

    _npmPath = _sharedPrefs.getString(NPM_PATH);

    if (_npmPath == null) {
      ProcessResult npmCheckResult =
          await Process.run("where", ["npm"], runInShell: true);
      bool isNpmInstalled = npmCheckResult.stderr == "";

      if (!isNpmInstalled) {
        setState(() {
          _currentView = View.error;
        });

        return;
      } else {
        _npmPath = npmCheckResult.stdout.split("\n")[0].trim();

        await _sharedPrefs.setString(NPM_PATH, _npmPath!);
      }
    }

    String? _preDefinedOutputPath = _sharedPrefs.getString(OUTPUT_PATH);

    if (_preDefinedOutputPath == null) {
      _outputPath = Directory.current.path + "\\output";
      await _sharedPrefs.setString(OUTPUT_PATH, _outputPath!);
    } else {
      _outputPath = _preDefinedOutputPath;
    }

    _outputPathController.text = _outputPath!;

    setState(() {
      _currentView = View.main;
    });
  }

  Widget _errorView() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.only(bottom: kToolbarHeight / 2),
        child: Text(
          "npm is not installed on your machine.\nPlease install npm and restart.",
          style: TextStyle(
            fontWeight: FontWeight.bold,
          ),
          textAlign: TextAlign.center,
        ),
      ),
    );
  }

  Widget _scraperErrorView() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.only(bottom: kToolbarHeight / 2),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20.0),
          child: Text(
            "A scraper error has occurred. Log file might be found in ./logs dir",
            textAlign: TextAlign.center,
          ),
        ),
      ),
    );
  }

  Widget _mainView() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: 4.0,
          ),
          child: Text(
            "Enter the required data and press run to start the process.",
            style: TextStyle(
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        SizedBox(
          height: 15,
        ),
        Material(
          borderRadius: BorderRadius.all(Radius.circular(4.0)),
          color: Colors.grey.shade100,
          child: InkWell(
            borderRadius: BorderRadius.all(Radius.circular(4.0)),
            onTap: () async {
              String? outputDir = await _selectOutputDir();

              if (outputDir != null) {
                await _sharedPrefs.setString(OUTPUT_PATH, outputDir);

                _outputPath = outputDir;
                _outputPathController.text = outputDir;
              }
            },
            child: TextField(
              controller: _outputPathController,
              decoration: InputDecoration(
                suffixIcon: Icon(Icons.folder_rounded),
                contentPadding:
                    EdgeInsets.symmetric(vertical: 4, horizontal: 8),
                labelText: "Output Directory",
                enabled: false,
                disabledBorder: OutlineInputBorder(
                  borderSide: BorderSide(
                    color: Colors.grey.shade200,
                    width: 1.0,
                  ),
                ),
                focusedBorder: OutlineInputBorder(
                  borderSide: BorderSide(
                    color: Theme.of(context).primaryColor,
                    width: 1.0,
                  ),
                ),
                enabledBorder: OutlineInputBorder(
                  borderSide: BorderSide(
                    color: Colors.grey.shade300,
                    width: 1.0,
                  ),
                ),
                labelStyle: TextStyle(
                  fontSize: 16.0,
                ),
              ),
              style: TextStyle(
                fontSize: 14.0,
                fontWeight: FontWeight.w500,
                color: Colors.black,
              ),
            ),
          ),
        ),
        SizedBox(
          height: 10,
        ),
        TextField(
          onChanged: (String text) {
            setState(() {
              _emailAddress = text;
            });
          },
          decoration: InputDecoration(
            contentPadding: EdgeInsets.symmetric(vertical: 4, horizontal: 8),
            labelText: "Email Address",
            disabledBorder: OutlineInputBorder(
              borderSide: BorderSide(
                color: Colors.grey.shade200,
                width: 1.0,
              ),
            ),
            focusedBorder: OutlineInputBorder(
              borderSide: BorderSide(
                color: Theme.of(context).primaryColor,
                width: 1.0,
              ),
            ),
            enabledBorder: OutlineInputBorder(
              borderSide: BorderSide(
                color: Colors.grey.shade300,
                width: 1.0,
              ),
            ),
          ),
          style: TextStyle(
            fontSize: 16.0,
            fontWeight: FontWeight.w500,
            color: Colors.black,
          ),
        ),
        SizedBox(
          height: 10,
        ),
        TextField(
          onChanged: (String text) {
            String formattedUrl;

            try {
              var uri = Uri.dataFromString(text);

              if (uri.queryParameters.containsKey("eventid")) {
                formattedUrl =
                    "https://event.on24.com/wcc/r/${uri.queryParameters['eventid']}/${uri.queryParameters['key']}";
              } else {
                formattedUrl = uri.path;
              }

              if (formattedUrl.indexOf(",") > -1 &&
                  6 > formattedUrl.indexOf(","))
                formattedUrl = formattedUrl.split(",")[1];
            } catch (e) {
              formattedUrl = text;
            }

            setState(() {
              _eventUrl = formattedUrl;
            });
          },
          decoration: InputDecoration(
            contentPadding: EdgeInsets.symmetric(vertical: 4, horizontal: 8),
            labelText: "Event URL",
            disabledBorder: OutlineInputBorder(
              borderSide: BorderSide(
                color: Colors.grey.shade200,
                width: 1.0,
              ),
            ),
            focusedBorder: OutlineInputBorder(
              borderSide: BorderSide(
                color: Theme.of(context).primaryColor,
                width: 1.0,
              ),
            ),
            enabledBorder: OutlineInputBorder(
              borderSide: BorderSide(
                color: Colors.grey.shade300,
                width: 1.0,
              ),
            ),
          ),
          style: TextStyle(
            fontSize: 16.0,
            fontWeight: FontWeight.w500,
            color: Colors.black,
          ),
        ),
        Expanded(
          child: Container(),
        ),
        Material(
          borderRadius: BorderRadius.all(Radius.circular(4.0)),
          color: _dataEntered
              ? Theme.of(context).colorScheme.secondary
              : Colors.grey.shade400,
          child: InkWell(
            onTapDown: (_) async {
              setState(() {
                _currentView = View.processing;
              });

              await Process.run(
                "npm run start",
                [
                  _emailAddress,
                  _eventUrl,
                  _outputPath!,
                  "--prefix",
                  _scraperPath!
                ],
                runInShell: true,
              );

              setState(() {
                _currentView = View.main;
              });
            },
            borderRadius: BorderRadius.all(Radius.circular(4.0)),
            child: Padding(
              padding: const EdgeInsets.all(10.0),
              child: Text(
                "Run",
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 17,
                ),
              ),
            ),
            onTap: _dataEntered ? () {} : null,
          ),
        ),
      ],
    );
  }

  Widget _loadingView() {
    return Padding(
      padding: const EdgeInsets.only(bottom: kToolbarHeight / 2),
      child: Center(
        child: CircularProgressIndicator(),
      ),
    );
  }

  Widget _processingView() {
    return Padding(
      padding: const EdgeInsets.only(bottom: kToolbarHeight / 2),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.center,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          CircularProgressIndicator(),
          SizedBox(
            height: 15,
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24.0),
            child: Text(
              "Video is in process, this might take up to 30 mins. Please wait and don't close the app.",
              textAlign: TextAlign.center,
              style: TextStyle(
                fontWeight: FontWeight.normal,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<String?> _selectOutputDir() async {
    try {
      String? filePickerResult = await FilePicker.platform.getDirectoryPath();

      return filePickerResult;
    } catch (_) {
      return null;
    }
  }

  Widget _renderView() {
    switch (_currentView) {
      case View.main:
        return _mainView();
      case View.error:
        return _errorView();
      case View.loading:
        return _loadingView();
      case View.processing:
        return _processingView();
      case View.scraperError:
        return _scraperErrorView();
      default:
        return _loadingView();
    }
  }

  String _appBarText() {
    switch (_currentView) {
      case View.main:
        return "On24-Extractor";
      case View.error:
        return "Error";
      case View.loading:
        return "Loading";
      case View.processing:
        return "Extracting to $_outputPath";
      default:
        return "Loading";
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_appBarText()),
      ),
      body: Container(
        padding: EdgeInsets.all(10),
        child: _renderView(),
      ),
    );
  }
}
