import 'package:flutter/material.dart';
import 'package:on24app/src/features/on24/pages/on24_page.dart';

class App extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      home: On24Page(),
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        canvasColor: Colors.white,
        appBarTheme: AppBarTheme(
          backgroundColor: Colors.white,
          elevation: 0.3,
          titleTextStyle: TextStyle(
            color: Colors.black,
            fontWeight: FontWeight.bold,
            fontSize: 15,
          ),
          iconTheme: IconThemeData(
            color: Colors.teal,
          ),
        ),
      ),
    );
  }
}
